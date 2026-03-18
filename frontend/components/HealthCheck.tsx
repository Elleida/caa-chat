"use client";

import { useEffect, useState } from "react";
import { getApiBase } from "@/lib/backend";

// Usa el proxy de Next.js (/api/backend) para evitar acceso directo al puerto 8010.
function getBackendUrl(): string {
  return getApiBase();
}

type CheckStatus = "checking" | "ok" | "error";

interface HealthData {
  status: string;
  model_available: boolean;
}

export default function HealthCheck() {
  const [status, setStatus] = useState<CheckStatus>("checking");
  const [detail, setDetail] = useState<string>("");

  const run = async () => {
    setStatus("checking");
    setDetail("");
    try {
      const res = await fetch(`${getBackendUrl()}/health`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: HealthData = await res.json();
      if (!data.model_available) {
        setStatus("error");
        setDetail("Backend accesible pero el modelo no está disponible en Ollama.");
      } else {
        setStatus("ok");
        setDetail("Backend y modelo OK.");
      }
    } catch (e: unknown) {
      setStatus("error");
      const msg = e instanceof Error ? e.message : String(e);
      setDetail(`No se puede conectar con el backend en ${getBackendUrl()}. (${msg})`);
    }
  };

  useEffect(() => { run(); }, []);

  if (status === "checking") {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        <span className="w-2 h-2 rounded-full bg-gray-300 animate-pulse" />
        Comprobando conexión con el backend…
      </div>
    );
  }

  if (status === "ok") {
    return (
      <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
        <span className="w-2 h-2 rounded-full bg-green-500" />
        {detail}
      </div>
    );
  }

  return (
    <div className="text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-2 text-red-700 font-medium">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        Error de conexión con el backend
      </div>
      <p className="text-red-600">{detail}</p>
      <p className="text-red-500">
        Asegúrate de que el backend está corriendo en{" "}
        <code className="font-mono bg-red-100 px-1 rounded">{getBackendUrl()}</code>
      </p>
      <button
        onClick={run}
        className="mt-1 text-xs text-red-700 underline hover:no-underline"
      >
        Reintentar
      </button>
    </div>
  );
}
