"use client";

import { usePictogramStrip } from "@/hooks/usePictogramStrip";

interface Props {
  text: string;
  enabled: boolean;
}

/**
 * Muestra una fila de pictogramas ARASAAC con la palabra debajo.
 * Los pictogramas aparecen con fade-in progresivo al cargarse.
 * Las palabras sin pictograma se omiten silenciosamente.
 */
export default function PictogramStrip({ text, enabled }: Props) {
  const { items, loading } = usePictogramStrip(text, enabled);

  if (!enabled) return null;

  if (loading) {
    return (
      <div className="flex gap-2 mt-2 flex-wrap">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1 animate-pulse">
            <div className="w-14 h-14 bg-gray-200 rounded-lg" />
            <div className="w-10 h-2 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="flex gap-2 mt-2 flex-wrap">
      {items.map((item, i) => (
        <div
          key={`${item.pictogram_id}-${i}`}
          className="flex flex-col items-center gap-0.5 animate-fadeIn"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.url}
            alt={item.word}
            width={56}
            height={56}
            className="w-14 h-14 object-contain rounded-lg border border-gray-200 bg-white p-0.5"
            loading="lazy"
          />
          <span className="text-xs text-gray-600 text-center max-w-[56px] leading-tight truncate">
            {item.word}
          </span>
        </div>
      ))}
    </div>
  );
}
