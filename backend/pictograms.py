"""
Módulo de pictogramas ARASAAC.

Flujo:
  1. Al arrancar, descarga /v1/keywords/es y construye un set de palabras
     conocidas (solo para filtrar; no contiene IDs).
  2. POST /pictograms/resolve: tokeniza la frase, normaliza, busca candidatos
     en el set. Para los que hacen match, llama a bestsearch en paralelo y
     cachea ({token_normalizado → pictogram_id}) para peticiones futuras.
  3. El frontend construye las URLs estáticas:
       https://static.arasaac.org/pictograms/{id}/{id}_500.png
"""

import asyncio
import logging
import re
import unicodedata
from typing import Optional

import httpx

import ollama_client as llm

logger = logging.getLogger(__name__)

KEYWORDS_URL  = "https://api.arasaac.org/v1/keywords/es"
BESTSEARCH_URL = "https://api.arasaac.org/v1/pictograms/es/bestsearch/{word}"
PICTOGRAM_BASE = "https://static.arasaac.org/pictograms"

# Set de palabras normalizadas conocidas por ARASAAC
_keyword_set: set[str] = set()
# token_normalizado → pictogram_id  (None = buscado pero sin resultado)
_pictogram_cache: dict[str, Optional[int]] = {}

_index_ready = False
_index_lock = asyncio.Lock()

# ── Stopwords ─────────────────────────────────────────────────────────────────

_STOPWORDS = {
    "el", "la", "los", "las", "un", "una", "unos", "unas",
    "de", "del", "al", "en", "con", "por", "para", "a", "ante",
    "bajo", "cabe", "como", "contra", "desde", "durante", "entre",
    "hacia", "hasta", "mediante", "pero", "que", "sin", "sobre",
    "tras", "y", "o", "u", "e", "ni", "si", "no", "me", "te",
    "se", "le", "lo", "les", "nos", "os", "es", "ser", "estar",
    "he", "ha", "han", "hemos", "habeis", "haber",
    "son", "somos", "sois", "era", "eran",
    "su", "sus", "tu", "tus", "mi", "mis",
    "este", "ese", "aquel", "estos", "esos", "aquellos",
    "esta", "esa", "aquella", "estas", "esas", "aquellas",
    "yo", "el", "ella", "nosotros", "vosotros", "ellos", "ellas",
    "muy", "mas", "tan", "tambien", "tampoco",
}

# ── Normalización ─────────────────────────────────────────────────────────────

def _strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )


def _normalize(word: str) -> str:
    w = word.lower().strip()
    w = _strip_accents(w)
    w = re.sub(r"[^a-z]", "", w)
    return w


_SUFFIXES = [
    "mente", "ando", "iendo", "ados", "adas", "idos", "idas",
    "ado", "ada", "ido", "ida", "ante", "entes", "ente",
    "aban", "aron", "endo",
    "amos", "emos", "ais", "eis",
    "an", "as", "es", "os", "s",
]


def _candidates(token: str) -> list[tuple[str, str]]:
    """Devuelve lista de (candidato_normalizado, token_original)."""
    base = _normalize(token)
    if not base:
        return []
    variants = [base]
    for suffix in _SUFFIXES:
        if base.endswith(suffix) and len(base) - len(suffix) >= 3:
            stem = base[: len(base) - len(suffix)]
            if stem not in variants:
                variants.append(stem)
    return [(v, token) for v in variants]


# ── Carga del índice ──────────────────────────────────────────────────────────

async def load_keyword_index() -> None:
    """Descarga el set de keywords. Llamar en lifespan."""
    global _keyword_set, _index_ready
    async with _index_lock:
        if _index_ready:
            return
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(KEYWORDS_URL)
                resp.raise_for_status()
                data = resp.json()
            words = data.get("words", []) if isinstance(data, dict) else data
            _keyword_set = {_normalize(w) for w in words if _normalize(w)}
            _index_ready = True
            logger.info("Índice ARASAAC: %d keywords cargadas", len(_keyword_set))
        except Exception as exc:
            logger.warning("No se pudo cargar el índice ARASAAC: %s", exc)
            _keyword_set = set()
            _index_ready = True


# ── Búsqueda de pictograma individual ────────────────────────────────────────

async def _fetch_pictogram_id(word_normalized: str) -> Optional[int]:
    """Llama a bestsearch y devuelve el primer _id, o None."""
    if word_normalized in _pictogram_cache:
        return _pictogram_cache[word_normalized]
    try:
        url = BESTSEARCH_URL.format(word=word_normalized)
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                _pictogram_cache[word_normalized] = None
                return None
            results = resp.json()
            pid = int(results[0]["_id"]) if results else None
            _pictogram_cache[word_normalized] = pid
            return pid
    except Exception:
        _pictogram_cache[word_normalized] = None
        return None


def pictogram_url(pid: int) -> str:
    return f"{PICTOGRAM_BASE}/{pid}/{pid}_500.png"


# ── Resolución de frase ───────────────────────────────────────────────────────

async def resolve_sentence(text: str) -> list[dict]:
    """
    Recibe una frase y devuelve lista de:
      { "word": str, "pictogram_id": int, "url": str }
    Solo incluye tokens para los que existe pictograma.
    """
    if not _index_ready:
        await load_keyword_index()

    raw_tokens = re.findall(r"[A-Za-záéíóúüñÁÉÍÓÚÜÑ]+", text)
    tokens = [t for t in raw_tokens if _normalize(t) not in _STOPWORDS and len(_normalize(t)) >= 3]

    # Para cada token, hallar el candidato que esté en el keyword_set
    # token_original → candidato_normalizado a buscar (o None)
    to_fetch: dict[str, str] = {}  # token_original → candidato
    for token in tokens:
        for cand, orig in _candidates(token):
            if cand in _keyword_set:
                to_fetch[orig] = cand
                break

    # Tokens no encontrados en keyword_set → lematizar con LLM
    unmatched = [t for t in tokens if t not in to_fetch]
    if unmatched and _keyword_set:
        lemmas = await _lemmatize_with_llm(unmatched)
        for orig, lemma in zip(unmatched, lemmas):
            if lemma and lemma in _keyword_set:
                to_fetch[orig] = lemma

    if not to_fetch:
        return []

    # Llamadas a bestsearch en paralelo
    entries = list(to_fetch.items())
    pids = await asyncio.gather(*[_fetch_pictogram_id(cand) for _, cand in entries])

    results = []
    for (orig, _), pid in zip(entries, pids):
        if pid is not None:
            results.append({"word": orig, "pictogram_id": pid, "url": pictogram_url(pid)})

    # Reordenar según posición en el texto original
    order = {_normalize(t): i for i, t in enumerate(tokens)}
    results.sort(key=lambda r: order.get(_normalize(r["word"]), 9999))

    return results


async def _lemmatize_with_llm(tokens: list[str]) -> list[str]:
    """Pide al LLM la forma base de cada token."""
    word_list = ", ".join(tokens)
    messages = [
        {
            "role": "user",
            "content": (
                "Para cada palabra de la lista, escribe solo su forma base "
                "(infinitivo para verbos, singular masculino para sustantivos/adjetivos). "
                "Responde ÚNICAMENTE con las formas base separadas por comas, en el mismo orden, "
                "sin explicaciones ni puntuación adicional.\n"
                f"Palabras: {word_list}"
            ),
        }
    ]
    try:
        response = await llm.chat_completion(messages, temperature=0.0)
        parts = [p.strip().lower() for p in response.split(",")]
        while len(parts) < len(tokens):
            parts.append("")
        return parts[: len(tokens)]
    except Exception:
        return [""] * len(tokens)


