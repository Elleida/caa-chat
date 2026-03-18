#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# start.sh  — Arranca backend (FastAPI) y frontend (Next.js) en paralelo
# ─────────────────────────────────────────────────────────────────────────────
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

VENV="${VENV:-$ROOT/.venv}"

# Activar entorno virtual Python
if [[ ! -f "$VENV/bin/activate" ]]; then
  echo "⚠️  Entorno virtual no encontrado en $VENV"
  exit 1
fi
# shellcheck source=/dev/null
source "$VENV/bin/activate"
PYTHON="$VENV/bin/python"
echo "✓ Entorno Python activado: $VENV ($(python --version))"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Chat CAA — Arranque"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

OLLAMA_HOST="gtc2pc9.cps.unizar.es"
OLLAMA_URL="http://${OLLAMA_HOST}:11434"
MODEL="gemma3:27b"

# Verificar Ollama remoto
if ! curl -sf "${OLLAMA_URL}/api/tags" > /dev/null 2>&1; then
  echo "⚠️  No se puede conectar con Ollama en ${OLLAMA_URL}"
  echo "   Verifica que el servidor está arrancado y accesible desde esta máquina."
  exit 1
fi

# Verificar modelo
if ! curl -sf "${OLLAMA_URL}/api/tags" | grep -q "gemma3:27b"; then
  echo "⚠️  Modelo ${MODEL} no encontrado en ${OLLAMA_HOST}"
  echo "   Descárgalo allí con: ollama pull ${MODEL}"
  exit 1
fi

echo "✓ Ollama OK — ${MODEL} en ${OLLAMA_HOST}"

# Liberar puertos si están en uso
for PORT in 8010 3010; do
  if fuser "$PORT/tcp" > /dev/null 2>&1; then
    echo "⚠️  Puerto $PORT en uso — liberando..."
    fuser -k "$PORT/tcp" 2>/dev/null || true
    sleep 1
  fi
done

# Backend
echo "→ Arrancando backend en http://localhost:8010..."
cd "$BACKEND"
"$PYTHON" -m uvicorn main:app --host 0.0.0.0 --port 8010 --reload &
BACKEND_PID=$!

sleep 2

# Frontend
echo "→ Arrancando frontend en http://localhost:3010..."
cd "$FRONTEND"
rm -rf .next
npm run dev -- --port 3010 &
FRONTEND_PID=$!

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Frontend : http://localhost:3010"
echo "  Backend  : http://localhost:8010"
echo "  API docs : http://localhost:8010/docs"
echo "  Ollama   : http://gtc2pc9.cps.unizar.es:11434"
echo "  Modelo   : gemma3:27b"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Ctrl+C para detener todo"
echo ""

# Capturar Ctrl+C y matar ambos
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Detenido.'" INT TERM
wait
