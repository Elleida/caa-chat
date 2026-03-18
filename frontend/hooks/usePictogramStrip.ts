"use client";

import { useEffect, useState } from "react";
import { getApiBase } from "@/lib/backend";

export interface PictogramItem {
  word: string;
  pictogram_id: number;
  url: string;
}

/**
 * Resuelve los pictogramas ARASAAC para un texto dado.
 *
 * - Solo hace la petición si `enabled` es true y el texto no está vacío.
 * - Una vez resuelta, cachea el resultado en memoria por texto para evitar
 *   llamadas repetidas durante la misma sesión.
 * - Devuelve { items, loading }.
 */

const _cache = new Map<string, PictogramItem[]>();

export function usePictogramStrip(text: string, enabled: boolean) {
  const [items, setItems] = useState<PictogramItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !text.trim()) {
      setItems([]);
      return;
    }

    const cached = _cache.get(text);
    if (cached) {
      setItems(cached);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`${getApiBase()}/pictograms/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then((r) => r.json())
      .then((data: PictogramItem[]) => {
        if (cancelled) return;
        _cache.set(text, data);
        setItems(data);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [text, enabled]);

  return { items, loading };
}
