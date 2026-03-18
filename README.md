# Chat CAA — Comunicación Aumentativa y Alternativa

Aplicación de demostración para explorar cómo la IA puede asistir la comunicación de personas con dificultades comunicativas (p.e. TEA) en una conversación con un interlocutor cercano.

> **GitHub:** https://github.com/Elleida/caa-chat

## Motivación

Las personas con Trastorno del Espectro Autista (TEA) u otras condiciones que afectan a la comunicación hablada o escrita pueden beneficiarse de sistemas de **Comunicación Aumentativa y Alternativa (CAA)** que les ayuden a formular respuestas adecuadas al contexto. Esta aplicación simula ese proceso con tres instancias de un modelo de lenguaje (LLM) local vía Ollama.

## Características principales

- **Modo automático**: interlocutor y usuario son simulados por LLMs; el humano puede interceptar antes de que expire la cuenta atrás.
- **Modo real**: el humano elige entre las tres sugerencias o escribe texto libre; sin cuenta atrás, con tiempo de espera de 10 minutos como fallback.
- **Pictogramas ARASAAC**: cada mensaje del interlocutor y cada sugerencia se acompaña automáticamente de una tira de pictogramas obtenida de la API de ARASAAC, con lematización contextual mediante LLM para desambiguar formas verbales (p.ej. «coma» → *comer*).
- **Vista previa de pictogramas en tiempo real**: mientras el usuario escribe texto libre, los pictogramas se actualizan con debounce de 400 ms.
- **Gestor de sugerencias (LLM 2)**: analiza el contexto y genera tres opciones de respuesta adaptadas al perfil del usuario.
- **Perfiles configurables**: perfiles predefinidos para Alex (TEA1) y Carla (TEA2) como usuarios, y María (madre) y Lucas (profesor de apoyo) como interlocutores; editables y guardables desde la UI.
- **Persistencia SQLite**: todas las sesiones, turnos y secuencias de pictogramas se guardan en `backend/caa_chat.db`.
- **Panel de administración** (`/admin`): consulta el historial de conversaciones con pictogramas, los turnos con las tres sugerencias y qué eligió cada vez (humano o IA); permite borrar sesiones.
- **Diseño adaptado a móvil**: InfoPanel en cajón lateral, barra de progreso compacta, burbujas más anchas y panel de sugerencias con altura limitada.
- **Acceso multi-máquina**: resolución dinámica de URLs; el frontend funciona desde cualquier host sin recompilar.
- **100 % local**: usa Ollama, sin enviar datos a servicios externos (salvo la API pública de ARASAAC para pictogramas).

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
├── start.sh                    # Arranca backend + frontend
├── README.md
├── ARCHITECTURE.md
├── PROMPTS.md
│
├── backend/
│   ├── requirements.txt
│   ├── .env                    # OLLAMA_BASE_URL, DEFAULT_MODEL
│   ├── models.py               # Pydantic: perfiles, mensajes, eventos WS
│   ├── ollama_client.py        # Cliente async para la API REST de Ollama
│   ├── agents.py               # Los tres agentes LLM
│   ├── pictograms.py           # Resolución de pictogramas ARASAAC (índice + LLM)
│   ├── database.py             # SQLite: init, seed de perfiles, guardar turnos
│   └── main.py                 # FastAPI: WS /ws/conversation + admin REST
│
└── frontend/
    ├── lib/
    │   └── backend.ts          # getApiBase() y getWsUrl() dinámicos
    ├── types/index.ts           # Tipos TypeScript compartidos
    ├── next.config.ts           # Proxy /api/backend → localhost:8010
    ├── components/
    │   ├── ConfigForm.tsx       # Formulario con selector de perfiles
    │   ├── MessageList.tsx      # Burbujas de conversación + scroll automático
    │   ├── SuggestionPanel.tsx  # 3 sugerencias + texto libre + pictogramas
    │   ├── PictogramStrip.tsx   # Tira horizontal de pictogramas
    │   ├── ThinkingIndicator.tsx# Indicador animado "escribiendo…"
    │   ├── InfoPanel.tsx        # Sidebar con perfiles y progreso
    │   └── HealthCheck.tsx      # Indicador de estado de conexión
    └── app/
        ├── layout.tsx
        ├── globals.css
        ├── page.tsx             # Página principal + WebSocket + drawer móvil
        └── admin/
            └── page.tsx         # Panel de administración con pictogramas
```

## Personalización de perfiles

Desde la pantalla de configuración puedes:

- **Seleccionar un perfil predefinido** del desplegable (Alex TEA1, Carla TEA2, María madre, Lucas profesor).
- **Editar cualquier campo** manualmente (nombre, edad, condición, estilo comunicativo, intereses, sensibilidades, contexto).
- **Guardar el perfil** con el botón «Guardar», que lo persiste en la base de datos y lo hace disponible en sesiones futuras.

**Parámetros de conversación**
- Tema inicial que lanza el interlocutor
- Número máximo de turnos (2–20)
- Tiempo de espera por turno en modo automático (1–30 s)
- Modo: `automático` (LLM decide) / `real` (humano decide)

## Flujo de un turno

**Modo automático**
```
1. InterlocutorAgent (LLM 1)  →  genera un mensaje natural
2. GestorAgent       (LLM 2)  →  analiza contexto y propone 3 sugerencias
3. [Humano puede elegir antes de que expire la cuenta atrás (1–30 s)]
4. UserAgent         (LLM 3)  →  elige la sugerencia más adecuada (si nadie actuó)
5. La respuesta elegida se guarda en SQLite → siguiente turno
```

**Modo real**
```
1. InterlocutorAgent (LLM 1)  →  genera un mensaje natural
2. GestorAgent       (LLM 2)  →  propone 3 sugerencias
3. El humano elige una sugerencia o escribe texto libre (hasta 10 min)
4. UserAgent (LLM 3) como fallback si no hay respuesta
5. La respuesta elegida (con indicador «elegido por ti» / «elegido por IA») se guarda → siguiente turno
```

## Variables de entorno

**`backend/.env`** (ya configurado por defecto):
```env
OLLAMA_BASE_URL=http://gtc2pc9.cps.unizar.es:11434
DEFAULT_MODEL=gemma3:27b
```

**`frontend/.env.local`** (opcional — por defecto se usa resolución dinámica):
```env
# Descomenta solo si necesitas forzar URLs concretas
# NEXT_PUBLIC_BACKEND_URL=http://mi-servidor:8010
# NEXT_PUBLIC_WS_URL=ws://mi-servidor:8010/ws/conversation
```

Si no se definen estas variables, el frontend detecta el hostname del navegador automáticamente y construye las URLs, por lo que funciona desde cualquier máquina sin recompilar.

## Panel de administración

Accesible en `/admin`. Permite:

- **Conversaciones**: historial completo de sesiones, con detalle de cada turno (mensaje del interlocutor, las 3 sugerencias, cuál se eligió y si fue humano o IA, porcentaje de intervención humana, pictogramas asociados a cada mensaje).
- **Perfiles guardados**: lista de perfiles creados desde el formulario de configuración.
- **Borrar sesiones**: botón de papelera en cada sesión para eliminarla de la base de datos.

## Próximos pasos sugeridos

- [ ] Síntesis de voz (TTS) para leer las sugerencias en voz alta
- [ ] Métricas y evaluación de calidad de las sugerencias (feedback thumbs up/down)
- [ ] Streaming token a token del interlocutor para UX más fluida
