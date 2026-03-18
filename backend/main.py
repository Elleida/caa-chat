"""
Backend principal — FastAPI + WebSockets
Gestiona el flujo de conversación entre los tres agentes LLM.
Persiste sesiones, turnos y perfiles en SQLite.
"""
import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from typing import Dict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import (
    StartConversationRequest,
    UserProfile,
    InterlocutorProfile,
    Message,
    Role,
    Mode,
    SaveProfileRequest,
    UpdateProfileRequest,
)
from agents import InterlocutorAgent, GestorAgent, UserAgent
import ollama_client as llm
import database as db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_db()
    await db.seed_default_profiles()
    yield


app = FastAPI(title="Chat CAA — Comunicación Aumentativa", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────────────────────────
# REST — salud, perfiles por defecto
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    model_ok = await llm.check_model_available()
    return {"status": "ok", "model_available": model_ok}


@app.get("/profiles/defaults")
async def get_default_profiles():
    return {
        "user": UserProfile().model_dump(),
        "interlocutor": InterlocutorProfile().model_dump(),
    }


# ──────────────────────────────────────────────────────────────────────────────
# Admin — Perfiles guardados
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/admin/profiles")
async def admin_list_profiles(type: str | None = None):
    return await db.list_profiles(type)


@app.get("/admin/profiles/{profile_id}")
async def admin_get_profile(profile_id: int):
    p = await db.get_profile(profile_id)
    if not p:
        raise HTTPException(404, "Perfil no encontrado")
    return p


@app.post("/admin/profiles", status_code=201)
async def admin_save_profile(req: SaveProfileRequest):
    pid = await db.save_profile(req.name, req.type, req.data.model_dump())
    return {"id": pid}


@app.put("/admin/profiles/{profile_id}")
async def admin_update_profile(profile_id: int, req: UpdateProfileRequest):
    p = await db.get_profile(profile_id)
    if not p:
        raise HTTPException(404, "Perfil no encontrado")
    await db.update_profile(profile_id, req.name, req.data.model_dump())
    return {"ok": True}


@app.delete("/admin/profiles/{profile_id}")
async def admin_delete_profile(profile_id: int):
    p = await db.get_profile(profile_id)
    if not p:
        raise HTTPException(404, "Perfil no encontrado")
    await db.delete_profile(profile_id)
    return {"ok": True}


# ──────────────────────────────────────────────────────────────────────────────
# Admin — Sesiones y turnos
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/admin/sessions")
async def admin_list_sessions():
    return await db.list_sessions()


@app.get("/admin/sessions/{session_id}")
async def admin_get_session(session_id: str):
    s = await db.get_session(session_id)
    if not s:
        raise HTTPException(404, "Sesión no encontrada")
    return s


@app.get("/admin/sessions/{session_id}/turns")
async def admin_get_turns(session_id: str):
    s = await db.get_session(session_id)
    if not s:
        raise HTTPException(404, "Sesión no encontrada")
    turns = await db.get_turns(session_id)
    return {"session": s, "turns": turns}


# ──────────────────────────────────────────────────────────────────────────────
# WebSocket — conversación en tiempo real
# ──────────────────────────────────────────────────────────────────────────────

@app.websocket("/ws/conversation")
async def conversation_ws(websocket: WebSocket):
    await websocket.accept()
    session_id = str(uuid.uuid4())

    try:
        raw = await websocket.receive_text()
        config = StartConversationRequest(**json.loads(raw))

        user_profile = config.user_profile or UserProfile()
        interlocutor_profile = config.interlocutor_profile or InterlocutorProfile()
        mode = config.mode
        wait_seconds = max(1, config.wait_seconds)

        # Crear agentes
        interlocutor = InterlocutorAgent(interlocutor_profile, user_profile)
        gestor = GestorAgent(user_profile, interlocutor_profile)
        user_agent = UserAgent(user_profile, interlocutor_profile)

        # Persistir sesión
        await db.create_session(
            session_id,
            user_profile.model_dump(),
            interlocutor_profile.model_dump(),
            config.topic,
            mode.value,
            wait_seconds,
            config.max_turns,
        )

        history: list[Message] = []

        await _send(websocket, {
            "type": "status",
            "content": f"Sesión iniciada. Tema: {config.topic}",
            "session_id": session_id,
            "mode": mode.value,
            "wait_seconds": wait_seconds,
            "user_profile": user_profile.model_dump(),
            "interlocutor_profile": interlocutor_profile.model_dump(),
        })

        history.append(Message(role=Role.SYSTEM, content=f"Inicia la conversación sobre: {config.topic}"))

        for turn in range(config.max_turns):

            # — Interlocutor habla ─────────────────────────────────────────────
            await _send(websocket, {"type": "thinking", "agent": "interlocutor", "turn": turn})
            interlocutor_msg = await interlocutor.respond(history)
            history.append(Message(role=Role.INTERLOCUTOR, content=interlocutor_msg))
            await _send(websocket, {
                "type": "interlocutor",
                "content": interlocutor_msg,
                "name": interlocutor_profile.name,
                "turn": turn,
            })

            # — Gestor genera sugerencias ─────────────────────────────────────
            await _send(websocket, {"type": "thinking", "agent": "gestor", "turn": turn})
            suggestions = await gestor.suggest(history, interlocutor_msg)
            await _send(websocket, {
                "type": "suggestions",
                "content": suggestions,
                "turn": turn,
                "wait_seconds": wait_seconds,
            })

            # — Elección: humano (modo real) o automático ─────────────────────
            if mode == Mode.REAL:
                chosen_text, chosen_idx, chosen_by = await _wait_human(
                    websocket, suggestions, wait_seconds,
                    user_agent, interlocutor_msg, history
                )
            else:
                chosen_text, chosen_idx, chosen_by = await _wait_auto(
                    websocket, suggestions, wait_seconds,
                    user_agent, interlocutor_msg, history
                )

            # Persistir turno
            await db.save_turn(
                session_id, turn, interlocutor_msg,
                suggestions, chosen_text, chosen_idx, chosen_by
            )

            history.append(Message(role=Role.USER, content=chosen_text))
            await _send(websocket, {
                "type": "user",
                "content": chosen_text,
                "name": user_profile.name,
                "turn": turn,
                "selected_index": chosen_idx,
                "chosen_by": chosen_by,
            })

            await asyncio.sleep(0.5)

        await db.close_session(session_id, config.max_turns)
        await _send(websocket, {"type": "done", "content": "Conversación finalizada.", "turn": config.max_turns})

    except WebSocketDisconnect:
        try:
            await db.close_session(session_id, 0)
        except Exception:
            pass
    except Exception as e:
        try:
            await _send(websocket, {"type": "error", "content": str(e)})
            await db.close_session(session_id, 0)
        except Exception:
            pass


# ──────────────────────────────────────────────────────────────────────────────
# Helpers internos
# ──────────────────────────────────────────────────────────────────────────────

async def _send(ws: WebSocket, data: dict):
    await ws.send_text(json.dumps(data, ensure_ascii=False))


async def _wait_human(
    ws: WebSocket,
    suggestions: list[str],
    wait_seconds: float,
    user_agent: UserAgent,
    last_interlocutor_msg: str,
    history: list[Message],
) -> tuple[str, int, str]:
    """
    Modo REAL: espera hasta 10 minutos a que el humano elija una sugerencia
    o escriba un texto propio. No hay auto-selección por IA mientras el humano
    no haya respondido (solo fallback tras timeout extremo de 600 s).
    Mensajes aceptados del cliente:
      {"action": "choose", "index": N}   → elige sugerencia N
      {"action": "type",   "text": "..."}→ texto libre del usuario
    """
    try:
        raw = await asyncio.wait_for(ws.receive_text(), timeout=600)
        data = json.loads(raw)
        if data.get("action") == "choose":
            idx = max(0, min(int(data.get("index", 0)), len(suggestions) - 1))
            return suggestions[idx], idx, "human"
        if data.get("action") == "type":
            text = str(data.get("text", "")).strip()
            if text:
                return text, -1, "human"
    except asyncio.TimeoutError:
        pass
    except Exception:
        pass
    # Fallback solo tras 10 min de inactividad total
    text, idx = await user_agent.choose(suggestions, last_interlocutor_msg, history)
    return text, idx, "auto"


async def _wait_auto(
    ws: WebSocket,
    suggestions: list[str],
    wait_seconds: float,
    user_agent: UserAgent,
    last_interlocutor_msg: str,
    history: list[Message],
) -> tuple[str, int, str]:
    """
    Modo AUTO: primero intenta durante wait_seconds recibir elección manual;
    si no llega, el agente decide.
    """
    try:
        raw = await asyncio.wait_for(ws.receive_text(), timeout=wait_seconds)
        data = json.loads(raw)
        if data.get("action") == "choose":
            idx = max(0, min(int(data.get("index", 0)), len(suggestions) - 1))
            return suggestions[idx], idx, "human"
    except asyncio.TimeoutError:
        pass
    except Exception:
        pass
    text, idx = await user_agent.choose(suggestions, last_interlocutor_msg, history)
    return text, idx, "auto"
