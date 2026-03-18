/**
 * Helpers para construir URLs del backend de forma dinámica.
 *
 * REST  → usa el proxy de Next.js (/api/backend/...) que reenvía a
 *          localhost:8010 server-side. Funciona desde cualquier máquina
 *          sin exponer el puerto 8010 directamente.
 *
 * WS    → WebSocket requiere conexión directa (el proxy HTTP de Next.js
 *          no soporta WS). Usa window.location.hostname para resolver el
 *          host correcto automáticamente.
 *
 * Si se define NEXT_PUBLIC_BACKEND_URL / NEXT_PUBLIC_WS_URL en .env.local
 * se usan esas URLs y tienen prioridad (útil para producción o Docker).
 */

export function getApiBase(): string {
  // Prioridad: variable de entorno explícita
  if (process.env.NEXT_PUBLIC_BACKEND_URL) {
    return process.env.NEXT_PUBLIC_BACKEND_URL;
  }
  // En el navegador, usa el proxy de Next.js (misma origin, no expone puerto)
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/backend`;
  }
  return "/api/backend";
}

export function getWsUrl(): string {
  // Prioridad: variable de entorno explícita
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.hostname}:8010/ws/conversation`;
  }
  return "ws://localhost:8010/ws/conversation";
}
