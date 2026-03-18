"use client";

import { useState, useEffect } from "react";

/**
 * Devuelve la URL del pictograma ARASAAC más relevante para un texto dado,
 * o null si no se encuentra ninguno.
 *
 * - Extrae la primera palabra significativa del texto (omite stopwords).
 * - Cachea los resultados en memoria para evitar peticiones repetidas.
 */

// ── Caché en memoria (persiste mientras el módulo esté cargado) ──────────────
const cache = new Map<string, string | null>();

// ── Lista de stopwords españolas básicas ────────────────────────────────────
const STOPWORDS = new Set([
  "a", "al", "algo", "algunas", "algunos", "ante", "antes", "como", "con",
  "contra", "cual", "cuando", "de", "del", "desde", "donde", "durante", "e",
  "el", "ella", "ellas", "ellos", "en", "entre", "era", "eras", "eres", "es",
  "esa", "esas", "ese", "eso", "esos", "esta", "estas", "este", "esto", "estos",
  "estoy", "fue", "gran", "ha", "hace", "hacen", "hay", "he", "hemos", "her",
  "hoy", "la", "las", "le", "les", "lo", "los", "me", "mi", "mis", "mucho",
  "muchos", "muy", "más", "ni", "no", "nos", "o", "para", "pero", "poco",
  "por", "porque", "que", "quien", "se", "si", "sin", "sobre", "soy", "su",
  "sus", "también", "tan", "te", "tengo", "tener", "tiene", "tienen", "todo",
  "todos", "tu", "tus", "un", "una", "unas", "unos", "ya", "yo",
]);

/**
 * Extracts the first meaningful word from a Spanish sentence, skipping
 * stopwords and short words.
 */
function extractKeyword(text: string): string {
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar tildes
    .replace(/[^a-z0-9\s]/g, "")    // quitar puntuación
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  return words[0] ?? text.split(/\s+/)[0] ?? text;
}

/** Construye la URL de la imagen a partir del id del pictograma */
export function pictogramUrl(id: number): string {
  return `https://static.arasaac.org/pictograms/${id}/${id}_300.png`;
}

/** Hook: dado un texto de sugerencia devuelve la URL del pictograma o null */
export function usePictogram(text: string): string | null {
  const keyword = extractKeyword(text);
  const [url, setUrl] = useState<string | null>(cache.get(keyword) ?? null);

  useEffect(() => {
    if (!keyword) return;

    // Si ya está en caché no hacemos la petición
    if (cache.has(keyword)) {
      setUrl(cache.get(keyword)!);
      return;
    }

    let cancelled = false;

    fetch(`/api/arasaac?q=${encodeURIComponent(keyword)}`)
      .then((r) => r.json())
      .then(({ id }: { id: number | null }) => {
        if (cancelled) return;
        const result = id != null ? pictogramUrl(id) : null;
        cache.set(keyword, result);
        setUrl(result);
      })
      .catch(() => {
        if (!cancelled) cache.set(keyword, null);
      });

    return () => { cancelled = true; };
  }, [keyword]);

  return url;
}
