# Chat CAA — Comunicación Aumentativa y Alternativa

Aplicación de demostración para explorar cómo la IA puede asistir la comunicación de personas con dificultades comunicativas (p.e. TEA) en una conversación con un interlocutor cercano.

## Motivación

Las personas con Trastorno del Espectro Autista (TEA) u otras condiciones que afectan a la comunicación hablada o escrita pueden beneficiarse de sistemas de **Comunicación Aumentativa y Alternativa (CAA)** que les ayuden a formular respuestas adecuadas al contexto. Esta aplicación simula ese proceso con tres instancias de un modelo de lenguaje (LLM) local vía Ollama.

## Características principales

- **Simulación completamente automática**: el interlocutor y el usuario son simulados por LLMs con prompts específicos para cada perfil.
- **Gestor de sugerencias**: un tercer LLM analiza el contexto y genera tres opciones de respuesta adaptadas al perfil del usuario.
- **Intervención manual opcional**: en cada turno, el humano puede elegir una de las tres sugerencias antes de que el sistema decida automáticamente (ventana de 3 segundos).
- **Perfiles configurables**: nombre, condición, estilo comunicativo, intereses y sensibilidades, todo editable desde la UI.
- **100 % local**: usa Ollama, sin enviar datos a servicios externos.

## Requisitos

| Herramienta | Versión mínima |
|---|---|
| Python | 3.10+ |
| Node.js | 18+ |
| Ollama | 0.3+ (en `gtc2pc9.cps.unizar.es`) |
| Modelo | `gemma3:27b` |

## Instalación

### 1. Modelo en el servidor Ollama

El servidor Ollama corre en `gtc2pc9.cps.unizar.es:11434`. Asegúrate de que el modelo esté disponible (ejecutar en esa máquina):

```bash
ollama pull gemma3:27b
```

### 2. Backend (Python + FastAPI)

```bash
cd backend

# Con el venv del sistema o crea uno nuevo
pip install -r requirements.txt
```

### 3. Frontend (Next.js)

```bash
cd frontend
npm install
```

## Uso

### Arranque rápido (todo en uno)

```bash
# Desde la raíz del proyecto
ollama serve &          # si no está ya corriendo
./start.sh
```

| Servicio | URL |
|---|---|
| Frontend | http://localhost:3010 |
| Backend API | http://localhost:8010 |
| Swagger / Docs | http://localhost:8010/docs |
| Ollama (remoto) | http://gtc2pc9.cps.unizar.es:11434 |

### Arranque manual

```bash
# Terminal 1 — backend
cd backend
/ruta/a/python -m uvicorn main:app --host 0.0.0.0 --port 8010 --reload

# Terminal 2 — frontend
cd frontend
npm run dev -- --port 3010
```

## Estructura del proyecto

```
chat/
├── start.sh                    # Script de arranque unificado
├── README.md
├── ARCHITECTURE.md
│
├── backend/
│   ├── requirements.txt
│   ├── models.py               # Pydantic: perfiles, mensajes, eventos WebSocket
│   ├── ollama_client.py        # Cliente async para la API REST de Ollama
│   ├── agents.py               # Los tres agentes LLM
│   └── main.py                 # FastAPI: endpoints REST + WebSocket
│
└── frontend/
    ├── types/index.ts           # Tipos TypeScript compartidos
    ├── components/
    │   ├── MessageList.tsx      # Burbujas de conversación
    │   ├── SuggestionPanel.tsx  # Panel con las 3 sugerencias del gestor
    │   ├── ThinkingIndicator.tsx# Indicador animado "escribiendo…"
    │   ├── InfoPanel.tsx        # Sidebar con perfiles y progreso
    │   └── ConfigForm.tsx       # Formulario de configuración inicial
    └── app/
        ├── layout.tsx
        ├── globals.css
        └── page.tsx             # Página principal + gestión del WebSocket
```

## Personalización de perfiles

Desde la pantalla de configuración puedes editar:

**Usuario (Alex por defecto)**
- Nombre, edad, condición diagnóstica
- Estilo comunicativo (describe las capacidades y limitaciones)
- Intereses y sensibilidades

**Interlocutor (María por defecto)**
- Nombre, relación con el usuario
- Estilo comunicativo
- Contexto de la conversación

**Conversación**
- Tema inicial que lanza el interlocutor
- Número máximo de turnos (2–20)

## Flujo de un turno

```
1. InterlocutorAgent (LLM 1)  →  genera un mensaje natural
2. GestorAgent       (LLM 2)  →  analiza contexto y propone 3 sugerencias
3. [Humano puede elegir una sugerencia en 3 segundos]
4. UserAgent         (LLM 3)  →  elige la sugerencia más adecuada (si nadie actuó)
5. La respuesta elegida se añade al historial → siguiente turno
```

## Variables de entorno (opcionales)

Los valores por defecto ya están configurados. Crea `backend/.env` para sobreescribirlos:

```env
# backend/.env
OLLAMA_BASE_URL=http://gtc2pc9.cps.unizar.es:11434
DEFAULT_MODEL=gemma3:27b
```

Y `frontend/.env.local` para el frontend:

```env
# frontend/.env.local
NEXT_PUBLIC_WS_URL=ws://localhost:8010/ws/conversation
```

## Próximos pasos sugeridos

- [ ] Integración con pictogramas ARASAAC en las sugerencias
- [ ] Soporte de síntesis de voz (TTS) para leer las sugerencias
- [ ] Historial de sesiones persistente (SQLite / PostgreSQL)
- [ ] Modo "real": el usuario humano usa las sugerencias en lugar del agente automático
- [ ] Panel de administración para gestionar perfiles guardados
- [ ] Tests de evaluación de la calidad de las sugerencias
