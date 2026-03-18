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

# Palabras con valor semántico que SIEMPRE se pictografían aunque sean cortas
_SEMANTIC_KEEP = {
    "no", "si", "mas", "muy", "ya", "hay", "hoy", "ayer", "bien", "mal",
    "aqui", "alli", "alla", "aca", "nunca", "jamas", "nada", "nadie",
    "poco", "mucho", "todo", "algo", "alguien",
    "antes", "despues", "ahora", "siempre", "tambien", "tampoco",
    "por", "sin", "con",
}

# Palabras con tilde diacrítica o interrogativas que se distinguen del token original
# (antes de normalizar), evitando confundir "que" (conjunción) con "qué", etc.
_ACCENTED_SEMANTIC = {
    "qué", "quién", "quiénes", "cómo", "cuándo", "dónde", "cuál", "cuáles",
    "cuánto", "cuánta", "cuántos", "cuántas",
    "sé",   # 1ª persona de saber (vs. pronombre "se")
    "sí",   # afirmación (vs. conjunción condicional "si")
    "más",  # adverbio de cantidad (vs. conjunción adversativa "mas")
    "tú", "él", "mí", "té",  # pronombres/sustantivos con tilde
}

_STOPWORDS = {
    "el", "la", "los", "las", "un", "una", "unos", "unas",
    "de", "del", "al", "en", "con", "por", "para", "a", "ante",
    "bajo", "cabe", "como", "contra", "desde", "durante", "entre",
    "hacia", "hasta", "mediante", "pero", "que", "sin", "sobre",
    "tras", "y", "o", "u", "e", "ni", "me", "te",
    "se", "le", "lo", "les", "nos", "os", "es", "ser", "estar",
    "he", "ha", "han", "hemos", "habeis", "haber",
    "son", "somos", "sois", "era", "eran",
    "su", "sus", "tu", "tus", "mi", "mis",
    "este", "ese", "aquel", "estos", "esos", "aquellos",
    "esta", "esa", "aquella", "estas", "esas", "aquellas",
    "yo", "el", "ella", "nosotros", "vosotros", "ellos", "ellas",
} - _SEMANTIC_KEEP  # nunca eliminar palabras semánticamente relevantes

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

    # Usar índices posicionales como clave para soportar tokens repetidos
    indexed_tokens: list[tuple[int, str]] = [
        (i, t) for i, t in enumerate(raw_tokens)
        if t.lower() in _ACCENTED_SEMANTIC
        or (
            _normalize(t) not in _STOPWORDS
            and (_normalize(t) in _SEMANTIC_KEEP or len(_normalize(t)) >= 3)
        )
    ]

    # Lematizar TODOS los tokens con LLM (con contexto de frase para desambiguar).
    # El LLM va primero para evitar que formas verbales coincidan directamente con
    # palabras del índice ARASAAC (p.ej. "coma" → coma tipográfica vs. verbo comer).
    llm_lemmas: list[str] = []
    if indexed_tokens and _keyword_set:
        llm_lemmas = await _lemmatize_with_llm([t for _, t in indexed_tokens], context=text)

    # idx → (token_original, candidato_normalizado)
    to_fetch: dict[int, tuple[str, str]] = {}
    for i, (idx, token) in enumerate(indexed_tokens):
        # 1) Intentar con el lema del LLM
        lemma = llm_lemmas[i] if i < len(llm_lemmas) else ""
        if lemma and lemma in _keyword_set:
            to_fetch[idx] = (token, lemma)
            continue
        # 2) Fallback: candidatos directos (forme normalizada + sufijos)
        for cand, _ in _candidates(token):
            if cand in _keyword_set:
                to_fetch[idx] = (token, cand)
                break

    if not to_fetch:
        return []

    # Ordenar por posición en el texto original
    sorted_entries = sorted(to_fetch.items())  # [(idx, (orig, cand)), ...]
    pids = await asyncio.gather(*[_fetch_pictogram_id(cand) for _, (_, cand) in sorted_entries])

    results = []
    for (_, (orig, _)), pid in zip(sorted_entries, pids):
        if pid is not None:
            results.append({"word": orig, "pictogram_id": pid, "url": pictogram_url(pid)})

    return results


async def _lemmatize_with_llm(tokens: list[str], context: str = "") -> list[str]:
    """Pide al LLM la forma base de cada token, con la frase original como contexto."""
    word_list = " | ".join(tokens)
    context_line = f'Frase original: "{context}"\n' if context else ""
    messages = [
        {
            "role": "user",
            "content": (
                f"{context_line}"
                "Para cada palabra de la lista, escribe solo su forma base de acuerdo con el contexto de la frase original. La forma base es: "
                "(infinitivo para verbos, singular masculino para sustantivos/adjetivos). "
                "IMPORTANTE: todas las palabras de la lista son palabras del idioma español, "
                "NUNCA signos de puntuación. Un signo de puntuación es únicamente un carácter "
                "como ',', '.', '!', '?', ';', etc. "
                "La palabra 'coma' NO es una coma ',', es la forma verbal del verbo 'comer'. "
                "La palabra 'punto' NO es un punto '.', es un sustantivo. "
                "Responde ÚNICAMENTE con las formas base separadas por ' | ', en el mismo orden, "
                "sin explicaciones ni puntuación adicional.\n"
                f"Palabras: {word_list}"
            ),
        }
    ]
    try:
        response = await llm.chat_completion(messages, temperature=0.0)
        parts = [p.strip().lower() for p in response.split("|")]
        while len(parts) < len(tokens):
            parts.append("")
        return parts[: len(tokens)]
    except Exception:
        return [""] * len(tokens)


