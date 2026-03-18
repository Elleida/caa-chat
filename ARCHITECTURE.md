# Arquitectura — Chat CAA

## Visión general

La aplicación sigue una arquitectura cliente–servidor desacoplada donde el backend coordina tres instancias independientes de un LLM (vía Ollama) y expone la lógica de conversación al frontend mediante un WebSocket.

```
┌──────────────────────────────────────────────────────────────────┐
│  Navegador (localhost:3010)                                       │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Next.js 16 — App Router                                 │    │
│  │                                                          │    │
│  │  ConfigForm  ──► page.tsx (WS client) ──► MessageList   │    │
│  │                       │                   SuggestionPanel│    │
│  │                       │                   InfoPanel      │    │
│  └───────────────────────┼──────────────────────────────────┘    │
└──────────────────────────┼───────────────────────────────────────┘
                           │  WebSocket  ws://localhost:8010
┌──────────────────────────▼───────────────────────────────────────┐
│  FastAPI (localhost:8010)                                         │
│                                                                   │
│  GET  /health              ← comprueba conexión y modelo         │
│  GET  /profiles/defaults   ← perfiles por defecto                │
│  WS   /ws/conversation     ← flujo principal                     │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  Bucle de conversación (N turnos)                        │     │
│  │                                                          │     │
│  │  InterlocutorAgent  ──►  GestorAgent  ──►  UserAgent    │     │
│  │       (LLM 1)              (LLM 2)          (LLM 3)     │     │
│  └──────────────────────────┬──────────────────────────────┘     │
└─────────────────────────────┼────────────────────────────────────┘
                              │  HTTP REST  (httpx async)
┌─────────────────────────────▼────────────────────────────────────┐
│  Ollama  (gtc2pc9.cps.unizar.es:11434)                           │
│                                                                   │
│  POST /api/chat  ←  modelo: gemma3:27b                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## Componentes del backend

### `models.py` — Modelos de datos

Define con Pydantic los tipos que circulan por la aplicación:

| Clase | Descripción |
|---|---|
| `UserProfile` | Perfil del usuario con TEA (nombre, condición, estilo comunicativo, intereses, sensibilidades) |
| `InterlocutorProfile` | Perfil del interlocutor (nombre, relación, contexto) |
| `Message` | Mensaje individual con rol (`user` / `interlocutor` / `system`) y contenido |
| `StartConversationRequest` | Payload inicial enviado por el frontend al abrir el WebSocket |
| `ConversationEvent` | Evento emitido por el servidor al frontend (tipo, contenido, turno…) |

### `ollama_client.py` — Cliente Ollama

Encapsula la comunicación con la API REST de Ollama:

- `chat_completion()` — llamada síncrona (espera respuesta completa); usada por los tres agentes.
- `chat_stream()` — llamada streaming token a token; disponible para futuras mejoras de UX.
- `check_model_available()` — verifica que el modelo esté descargado.

La URL base y el modelo se leen de variables de entorno (`OLLAMA_BASE_URL`, `DEFAULT_MODEL`) con fallback a los valores del servidor de la Universidad de Zaragoza.

### `agents.py` — Los tres agentes

#### LLM 1 — `InterlocutorAgent`

Simula a la persona con quien el usuario habla (familiar, amigo, terapeuta…).

- **Prompt**: recibe el perfil del interlocutor y del usuario. Se le indica que use frases sencillas y directas, que sea natural y afectuoso.
- **Temperatura**: 0.8 (más variabilidad, conversación más natural).
- **Historial**: ve la conversación desde su perspectiva (sus mensajes = `assistant`, los del usuario = `user`).

#### LLM 2 — `GestorAgent`

Es el núcleo del sistema CAA. Analiza el contexto y genera tres sugerencias de respuesta adaptadas al perfil del usuario.

- **Prompt**: describe en detalle el perfil del usuario (condición, estilo comunicativo, intereses, sensibilidades) y las reglas para las sugerencias.
- **Reglas de sugerencias**:
  - Máximo 15 palabras por sugerencia.
  - Sin metáforas ni lenguaje figurado.
  - Las tres cubren intenciones distintas: informativa, emocional y aclaratoria.
- **Temperatura**: 0.6 (balance entre creatividad y coherencia).
- **Parsing**: extrae las tres líneas numeradas con regex; fallback a líneas no vacías.

#### LLM 3 — `UserAgent`

Simula al usuario con TEA eligiendo la sugerencia más adecuada en ese momento.

- **Prompt**: adopta el papel del usuario, describe su forma de sentir y comunicarse.
- **Input**: recibe las tres sugerencias, el último mensaje del interlocutor y el historial reciente.
- **Output esperado**: un único dígito (1, 2 o 3).
- **Temperatura**: 0.3 (respuesta más determinista, evita salidas incoherentes).

### `main.py` — FastAPI + WebSocket

El endpoint `WS /ws/conversation` gestiona el ciclo de vida completo:

```
Cliente conecta
       │
       ▼
Recibe StartConversationRequest (JSON)
       │
       ▼
Crea los 3 agentes con los perfiles recibidos
       │
       ▼
┌──────────────────────────────────┐
│  for turn in range(max_turns):  │
│                                  │
│  1. Interlocutor.respond()       │  → event: "interlocutor"
│  2. Gestor.suggest()             │  → event: "suggestions"
│  3. Espera 3s por elección manual│
│     └─► UserAgent.choose()       │  → event: "user"
│                                  │
└──────────────────────────────────┘
       │
       ▼
event: "done"  →  cierra WebSocket
```

**Eventos WebSocket emitidos (servidor → cliente):**

| Tipo | Cuándo | Contenido |
|---|---|---|
| `status` | Al iniciar | Mensaje de confirmación + perfiles |
| `thinking` | Antes de cada LLM | Qué agente está procesando |
| `interlocutor` | Tras LLM 1 | Texto del mensaje del interlocutor |
| `suggestions` | Tras LLM 2 | Array con las 3 sugerencias |
| `user` | Tras LLM 3 o elección manual | Texto elegido + índice |
| `error` | Si algo falla | Descripción del error |
| `done` | Al terminar | Mensaje de fin |

**Mensaje recibido (cliente → servidor):**

```json
{ "action": "choose", "index": 0 }
```

Si llega antes del timeout de 3 s, el índice elegido por el humano sobreescribe al del agente.

---

## Componentes del frontend

### `types/index.ts`

Tipos TypeScript que espejean los modelos del backend: `ChatMessage`, `WsEvent`, `UserProfile`, `InterlocutorProfile`, `ConversationConfig`.

### Componentes React

| Componente | Responsabilidad |
|---|---|
| `ConfigForm` | Formulario con todos los campos editables de los dos perfiles, el tema y el número de turnos |
| `MessageList` | Lista de burbujas de chat con scroll automático al último mensaje |
| `SuggestionPanel` | Tres botones coloreados (verde / violeta / ámbar) con las sugerencias del gestor |
| `ThinkingIndicator` | Indicador animado de puntos mientras el LLM procesa |
| `InfoPanel` | Sidebar lateral con los perfiles cargados, barra de progreso de turnos y leyenda |

### `app/page.tsx`

Gestiona el estado global de la aplicación y el ciclo de vida del WebSocket:

- `appStatus`: `idle | connecting | running | done | error`
- El handler `handleWsEvent` despacha cada evento entrante al estado correspondiente.
- `manualChoiceCbRef`: ref que almacena la función de envío de elección manual; se invalida al llegar el evento `user`.

---

## Flujo de datos completo (un turno)

```
Frontend                    Backend                     Ollama (remoto)
   │                           │                              │
   │◄── ws event: thinking ────│                              │
   │                    LLM 1: InterlocutorAgent.respond()    │
   │                           │──── POST /api/chat ─────────►│
   │                           │◄─── respuesta ──────────────│
   │◄── ws event: interlocutor ┤                              │
   │                           │                              │
   │◄── ws event: thinking ────│                              │
   │                    LLM 2: GestorAgent.suggest()          │
   │                           │──── POST /api/chat ─────────►│
   │                           │◄─── 3 sugerencias ──────────│
   │◄── ws event: suggestions ─┤                              │
   │                           │                              │
   │  [3 s para elección manual]                              │
   │── ws msg: choose(idx)? ──►│                              │
   │                           │                              │
   │                    LLM 3: UserAgent.choose()  (si no hubo elección)
   │                           │──── POST /api/chat ─────────►│
   │                           │◄─── índice elegido ─────────│
   │◄── ws event: user ────────┤                              │
   │                           │                              │
```

---

## Configuración de entorno

| Variable | Archivo | Valor configurado |
|---|---|---|
| `OLLAMA_BASE_URL` | `backend/.env` | `http://gtc2pc9.cps.unizar.es:11434` |
| `DEFAULT_MODEL` | `backend/.env` | `gemma3:27b` |
| `NEXT_PUBLIC_WS_URL` | `frontend/.env.local` | `ws://localhost:8010/ws/conversation` |
| Puerto backend | `start.sh` / uvicorn | `8010` |
| Puerto frontend | `start.sh` / next dev | `3010` |

---

## Consideraciones de escalabilidad

- **Sesiones**: actualmente en memoria (`dict` Python). Para múltiples usuarios simultáneos sería necesario Redis o una base de datos.
- **Concurrencia**: FastAPI + uvicorn con workers async soporta múltiples sesiones WebSocket sin bloqueo gracias a `httpx` async.
- **Latencia**: `gemma3:27b` es un modelo grande; cada turno implica 3 llamadas secuenciales al LLM. El tiempo por turno depende del hardware del servidor Ollama.
- **Streaming**: `ollama_client.py` ya incluye `chat_stream()`; conectarlo al WebSocket permitiría mostrar las respuestas token a token.
