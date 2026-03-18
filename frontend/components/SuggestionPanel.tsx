import { useEffect, useState, useRef } from "react";
import { ConversationMode } from "@/types";

interface Props {
  suggestions: string[];
  onChoose: (index: number) => void;
  onType?: (text: string) => void;
  disabled?: boolean;
  waitSeconds?: number;
  mode?: ConversationMode;
}

const colors = [
  "border-emerald-400 bg-emerald-50 hover:bg-emerald-100 text-emerald-800",
  "border-violet-400 bg-violet-50 hover:bg-violet-100 text-violet-800",
  "border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-800",
];

const labels = ["Respuesta A", "Respuesta B", "Respuesta C"];

export default function SuggestionPanel({
  suggestions,
  onChoose,
  onType,
  disabled,
  waitSeconds = 3,
  mode = "auto",
}: Props) {
  const [remaining, setRemaining] = useState(waitSeconds);
  const [customText, setCustomText] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reiniciar cuenta atrás y limpiar texto cada vez que llegan nuevas sugerencias
  useEffect(() => {
    if (suggestions.length === 0) return;
    setRemaining(waitSeconds);
    setCustomText("");

    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          // En modo auto detiene el contador; en modo real sigue pero no bloquea
          if (mode !== "real") clearInterval(intervalRef.current!);
          return 0;
        }
        return r - 1;
      });
    }, 1000);

    return () => clearInterval(intervalRef.current!);
  }, [suggestions, waitSeconds, mode]);

  if (suggestions.length === 0) return null;

  const pct = Math.max(0, (remaining / waitSeconds) * 100);
  // En modo real los botones nunca se deshabilitan por el timer
  const isExpiredAuto = mode === "auto" && remaining === 0;

  const handleType = () => {
    const text = customText.trim();
    if (!text || !onType) return;
    onType(text);
    setCustomText("");
  };

  return (
    <div className={`border-t p-4 ${mode === "real" ? "bg-violet-50 border-violet-200" : "bg-gray-50 border-gray-200"}`}>
      {/* Cabecera */}
      <div className="flex items-center justify-between mb-3">
        <p className={`text-xs font-semibold uppercase tracking-wide ${mode === "real" ? "text-violet-600" : "text-gray-700"}`}>
          {mode === "real" ? "🙋 Elige o escribe tu respuesta" : "Sugerencias de respuesta"}
        </p>
        {/* Cuenta atrás */}
        <div className="flex items-center gap-2">
          <div className="w-24 bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all duration-1000 ${
                mode === "real" ? "bg-violet-400" : "bg-blue-500"
              } ${isExpiredAuto ? "opacity-30" : ""}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={`text-xs font-mono font-semibold w-6 text-right ${
            remaining === 0 && mode === "auto"
              ? "text-gray-300"
              : mode === "real"
              ? "text-violet-500"
              : "text-blue-600"
          }`}>
            {remaining === 0 && mode === "auto" ? "—" : `${remaining}s`}
          </span>
        </div>
      </div>

      {/* Sugerencias */}
      <div className="flex flex-col gap-2">
        {suggestions.map((text, i) => (
          <button
            key={i}
            disabled={disabled || isExpiredAuto}
            onClick={() => onChoose(i)}
            className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium
              transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed
              ${colors[i % colors.length]}`}
          >
            <span className="text-xs font-bold opacity-60 mr-2">{labels[i]}</span>
            {text}
          </button>
        ))}
      </div>

      {/* Campo de texto libre — solo en modo real */}
      {mode === "real" && (
        <div className="mt-3">
          <p className="text-xs text-violet-500 mb-1.5 font-medium">O escribe tu propia respuesta:</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleType()}
              placeholder="Escribe aquí…"
              disabled={disabled}
              className="flex-1 border border-violet-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white disabled:opacity-50"
            />
            <button
              onClick={handleType}
              disabled={disabled || !customText.trim()}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Enviar
            </button>
          </div>
        </div>
      )}

      {/* Mensaje de estado */}
      <p className="text-xs text-gray-700 mt-2 text-center">
        {mode === "real"
          ? "Tú decides. Pulsa una sugerencia o escribe tu respuesta."
          : isExpiredAuto
          ? "El agente ha elegido automáticamente"
          : `Haz clic para elegir o el agente decide en ${remaining} s`}
      </p>
    </div>
  );
}
