# Arquitectura — Chat CAA

## Visión general

La aplicación sigue una arquitectura cliente–servidor desacoplada donde el backend coordina tres instancias independientes de un LLM (vía Ollama), persiste el historial en SQLite y expone la lógica de conversación al frontend mediante WebSocket y una API REST de administración.

```
┌──────────────────────────────────────────────────────────────────┐
│  Navegador (cualquier host, puerto 3010)                          │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Next.js — App Router                                    │    │
│  │                                                          │    │
│  │  /          ConfigForm ──► page.tsx ──► MessageList      │    │
│  │                                  │      SuggestionPanel  │    │
│  │                                  │      InfoPanel        │    │
│  │  /admin     SessionsTab + ProfilesTab                    │    │
│  │                                                          │    │
│  │  lib/backend.ts → getApiBase() / getWsUrl()  (dinámico) │    │
│  └───────────┬──────────────────────┬───────────────────────┘    │
└──────────────┼──────────────────────┼───────────────────────────┘
               │  /api/backend/*      │  ws://{host}:8010
               │  (proxy Next.js)     │
┌──────────────▼──────────────────────▼───────────────────────────┐
│  FastAPI (0.0.0.0:8010)                                          │
│                                                                   │
│  GET  /health                                                     │
│  WS   /ws/conversation          ← flujo principal                │
│  POST /pictograms/resolve        ← lematiza y resuelve pictogramas│
│  GET  /admin/sessions                                             │
│  GET  /admin/sessions/{id}/turns                                  │
│  DELETE /admin/sessions/{id}                                      │
│  GET|POST /admin/profiles                                         │
│  GET|PUT|DELETE /admin/profiles/{id}                              │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  Bucle de conversación (N turnos)                        │     │
│  │  InterlocutorAgent → GestorAgent → _wait_human/_auto    │     │
│  │       (LLM 1)           (LLM 2)         → UserAgent     │     │
│  │                                              (LLM 3)    │     │
│  └──────────────────────┬──────────────────────────────────┘     │
│                          │  save_turn() → SQLite                 │
└──────────────────────────┼──────────────────────────────────────┘
                           │  HTTP REST  (httpx async)
┌──────────────────────────▼────────────────────────────────────┐
│  Ollama  (gtc2pc9.cps.unizar.es:11434)                        │
│  POST /api/chat  ←  modelo: gemma3:27b                        │
└───────────────────────────────────────────────────────────────┘
```

---

## Componentes del backend

### `models.py` — Modelos de datos

| Clase | Descripción |
|---|---|
| `UserProfile` | Perfil del usuario con TEA (nombre, edad, condición, estilo comunicativo, intereses, sensibilidades) |
| `InterlocutorProfile` | Perfil del interlocutor (nombre, relación, contexto, estilo comunicativo) |
| `Message` | Mensaje individual con rol (`user` / `interlocutor` / `system`) y contenido |
| `Mode` | Enum `auto` / `real` |
| `StartConversationRequest` | Payload inicial enviado por el frontend al abrir el WebSocket |
| `ConversationEvent` | Evento emitido por el servidor al frontend |

### `database.py` — Persistencia SQLite

Gestiona la base de datos `backend/caa_chat.db`:

- **`init_db()`**: crea las tablas `profiles`, `sessions` y `turns` si no existen; ejecuta migraciones `ALTER TABLE` seguras para añadir columnas nuevas a bases de datos existentes.
- **`seed_default_profiles()`**: inserta los cuatro perfiles predefinidos (Alex, Carla, María, Lucas) si la tabla está vacía.
- **`save_session()`**: registra una nueva sesión con los perfiles y la configuración usada.
- **`save_turn()`**: guarda cada turno con `interlocutor_msg`, `suggestion_0/1/2`, `chosen_text`, `chosen_index`, `chosen_by` (`"human"` o `"ai"`), y las secuencias de pictogramas (`interlocutor_pictograms`, `suggestion_0/1/2_pictograms`, `chosen_text_pictograms`) como JSON.
- **`end_session()`**: marca la sesión como finalizada con timestamp y el número real de turnos completados.
- **`delete_session()`**: elimina una sesión y todos sus turnos.

Esquema simplificado:
```
profiles  (id, role, name, data_json, created_at)
sessions  (id, user_profile_json, interlocutor_profile_json, topic,
           mode, max_turns, wait_seconds, turn_count, started_at, ended_at)
turns     (id, session_id, turn_number, interlocutor_msg,
           suggestion_0, suggestion_1, suggestion_2,
           chosen_text, chosen_index, chosen_by, created_at,
           interlocutor_pictograms,
           suggestion_0_pictograms, suggestion_1_pictograms, suggestion_2_pictograms,
           chosen_text_pictograms)
```

### `pictograms.py` — Resolución de pictogramas ARASAAC

Módulo asíncrono que convierte una frase en una secuencia de pictogramas:

1. **Índice de keywords** (`load_keyword_index()`): descarga `/v1/keywords/es` de la API ARASAAC al arrancar y construye dos índices: `_keyword_set` (palabras simples normalizadas) y `_multiword_keyword_set` (frases de varias palabras, p.ej. `"por favor"`).
2. **Tokenización y filtrado**: extrae tokens alfa del texto, elimina stopwords y palabras irrelevantes pero conserva palabras semánticas cortas (`no`, `sin`, `con`, `por`…) y palabras con tilde interrogativa/exclamativa (`qué`, `cómo`…).
3. **Emparejamiento greedy multi-palabra** (Paso 1): antes de procesar token a token, barre la frase buscando la secuencia más larga que coincida con `_multiword_keyword_set`. Los tokens consumidos no se procesan individualmente.
4. **Lematización con LLM** (`_lemmatize_with_llm()`): envía los tokens restantes junto con la frase completa como contexto al LLM (`temperature=0.0`), para desambiguar formas verbales (p.ej. `coma` → `comer`). El match directo en el índice actúa como fallback.
5. **Búsqueda de pictograma** (`_fetch_pictogram_id()`): llama a `/v1/pictograms/es/bestsearch/{lema}` en paralelo (URL-encodeado para frases multi-palabra) y cachea los resultados.
6. **`resolve_sentence(text)`**: punto de entrada público; devuelve lista de `{word, pictogram_id, url}`.

```
frase
  │
  ├─ greedy longest-match multi-palabra (índice _multiword_keyword_set)
  ├─ tokenizar tokens restantes + filtrar stopwords
  ├─ LLM lematiza con contexto de frase completa  ← temperatura 0.0
  ├─ fallback: candidates (normalización + sufijos)
  └─ bestsearch ARASAAC (paralelo, caché, URL-encode) → [{word, pictogram_id, url}]
```

### `ollama_client.py` — Cliente Ollama

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

- **Prompt**: describe el perfil del usuario (condición, estilo comunicativo, intereses, sensibilidades) y las reglas para las sugerencias.
- **Reglas**: máximo 15 palabras, sin metáforas, tres intenciones distintas (informativa / emocional / aclaratoria).
- **Temperatura**: 0.6.
- **Parsing**: extrae las tres líneas numeradas con regex; fallback a líneas no vacías.

#### LLM 3 — `UserAgent`

Simula al usuario con TEA eligiendo la sugerencia más adecuada.

- Solo activo en **modo automático** o como fallback en modo real (timeout 10 min).
- **Input**: tres sugerencias + último mensaje del interlocutor + historial.
- **Output esperado**: un único dígito (1, 2 o 3).
- **Temperatura**: 0.3 (respuesta determinista).

### `main.py` — FastAPI

**WebSocket `WS /ws/conversation`**:

```
Cliente conecta
       │
       ▼
Recibe StartConversationRequest (JSON)
       │  → save_session() en SQLite
       ▼
Crea los 3 agentes con los perfiles recibidos
       │
       ▼
┌──────────────────────────────────────────┐
│  for turn in range(max_turns):           │
│                                          │
│  1. Interlocutor.respond()               │  → event: "interlocutor"
│  2. Gestor.suggest()                     │  → event: "suggestions"
│  3. _resolve_turn_pictograms()           │  (paralelo, durante espera)
│     └ interlocutor + 3 sugerencias       │
│  4. _wait_human() / _wait_auto()         │
│     ├ modo real:  espera hasta 600 s     │
│     └ modo auto:  espera wait_seconds    │
│     └─► UserAgent.choose() si no hubo   │  → event: "user"
│         elección manual                  │
│  5. chosen_text_pictograms               │  (reutiliza sugg o resuelve texto libre)
│  save_turn() → SQLite (+ todos picts)    │
└──────────────────────────────────────────┘
       │
       ▼
event: "done"  →  end_session() → cierra WS
```

**Eventos WebSocket emitidos (servidor → cliente):**

| Tipo | Cuándo | Contenido relevante |
|---|---|---|
| `status` | Al iniciar | Confirmación + perfiles |
| `thinking` | Antes de cada LLM | Qué agente procesa |
| `interlocutor` | Tras LLM 1 | Texto del mensaje |
| `suggestions` | Tras LLM 2 | Array con 3 sugerencias |
| `user` | Tras LLM 3 o elección manual | Texto elegido + índice + `chosen_by` |
| `error` | Si algo falla | Descripción del error |
| `done` | Al terminar todos los turnos | — |

**Mensajes recibidos (cliente → servidor):**

```json
{ "action": "choose", "index": 0 }
{ "action": "type",   "text": "Quiero ir al parque" }
```

**Endpoints REST de administración:**

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/admin/sessions` | Lista de sesiones (resumen) |
| `GET` | `/admin/sessions/{id}/turns` | Detalle completo de una sesión |
| `GET` | `/admin/profiles` | Lista de perfiles guardados |
| `POST` | `/admin/profiles` | Crea un perfil |
| `PUT` | `/admin/profiles/{id}` | Actualiza un perfil |
| `DELETE` | `/admin/profiles/{id}` | Elimina un perfil |

---

## Componentes del frontend

### `lib/backend.ts` — Resolución dinámica de URLs

Evita URLs hardcodeadas para que el frontend funcione desde cualquier host:

- **`getApiBase()`**: usa `NEXT_PUBLIC_BACKEND_URL` si está definida; de lo contrario, `window.location.origin + "/api/backend"` (proxy Next.js → `localhost:8010`).
- **`getWsUrl()`**: usa `NEXT_PUBLIC_WS_URL` si está definida; de lo contrario, `ws://window.location.hostname:8010/ws/conversation`.

### `next.config.ts` — Proxy

```ts
rewrites: [
  { source: "/api/backend/:path*", destination: "http://localhost:8010/:path*" }
]
```

Las llamadas REST van siempre al mismo origen (sin CORS), mientras que el WebSocket conecta directamente al puerto 8010 del servidor.

### Componentes React

| Componente | Responsabilidad |
|---|---|
| `ConfigForm` | Selector de perfiles predefinidos/guardados, campos editables, botón Guardar, selector de modo y parámetros, toggle de pictogramas |
| `MessageList` | Burbujas de chat con scroll automático (`ResizeObserver` + `useLayoutEffect`); badge "elegido por ti" / "elegido por IA"; tira de pictogramas bajo cada mensaje |
| `SuggestionPanel` | Tres botones de sugerencia; campo de texto libre en modo real; vista previa de pictogramas en tiempo real (debounce 400 ms) |
| `PictogramStrip` | Fila horizontal de pictogramas con imagen y palabra debajo |
| `ThinkingIndicator` | Tres puntos animados mientras el LLM procesa |
| `InfoPanel` | Sidebar con perfiles activos, barra de progreso de turnos y leyenda; en móvil se abre como cajón deslizante |
| `HealthCheck` | Estado de conexión backend (checking / ok / error) |

### `app/page.tsx`

Gestiona el estado global y el ciclo de vida del WebSocket:

- `appStatus`: `idle | connecting | running | done | error`
- `manualChoiceCbRef`: ref con la función para enviar la elección manual; se invalida al recibir `user`.
- `manualTypeCbRef`: ref con la función para enviar texto libre.
- `showInfoDrawer`: estado del cajón lateral en móvil.
- `scrollRevision`: incrementado en cada evento `"suggestions"` para forzar scroll al fondo.
- Layout adaptativo: InfoPanel oculto en móvil → cajón con overlay; barra de progreso compacta.

### `app/admin/page.tsx`

Panel de administración con dos pestañas:

- **Conversaciones**: lista de sesiones → detalle de turnos con las 3 sugerencias, `chosen_by`, pictogramas de cada mensaje/sugerencia, y sección «Respuesta enviada» que muestra el texto elegido con su pictogramas — distingue sugerencia seleccionada (`✓ elegida por humano`), texto libre (`✏️ texto libre`) o elección por IA.
- **Perfiles guardados**: tabla consultable desde la DB.
- **Borrar sesión**: botón de papelera por sesión; llama a `DELETE /admin/sessions/{id}`.

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
   │  [espera manual (auto: N s / real: 600 s)]               │
   │── ws msg: choose/type? ──►│                              │
   │                           │                              │
   │                    LLM 3: UserAgent.choose()  (fallback) │
   │                           │──── POST /api/chat ─────────►│
   │                           │◄─── índice elegido ─────────│
   │◄── ws event: user ────────┤                              │
   │                    save_turn() → SQLite                  │
   │                           │                              │
```

---

## Configuración de entorno

| Variable | Archivo | Valor por defecto |
|---|---|---|
| `OLLAMA_BASE_URL` | `backend/.env` | `http://gtc2pc9.cps.unizar.es:11434` |
| `DEFAULT_MODEL` | `backend/.env` | `gemma3:27b` |
| `NEXT_PUBLIC_BACKEND_URL` | `frontend/.env.local` | *(dinámico — `window.location.origin/api/backend`)* |
| `NEXT_PUBLIC_WS_URL` | `frontend/.env.local` | *(dinámico — `ws://{hostname}:8010/...`)* |
| Puerto backend | `start.sh` / uvicorn | `8010` |
| Puerto frontend | `start.sh` / next dev | `3010` |

---

## Consideraciones de escalabilidad

- **Sesiones**: la sesión activa se mantiene como variables locales en el WebSocket handler. Para múltiples usuarios simultáneos cada conexión WS tiene su propio contexto; la BD SQLite es compartida.
- **Concurrencia**: FastAPI + uvicorn con workers async soporta múltiples sesiones WebSocket sin bloqueo gracias a `httpx` async.
- **Latencia**: `gemma3:27b` es un modelo grande; cada turno implica 3 llamadas secuenciales al LLM. El tiempo por turno depende del hardware del servidor Ollama.
- **Streaming**: `ollama_client.py` ya incluye `chat_stream()`; conectarlo al WebSocket permitiría mostrar las respuestas del interlocutor token a token.
