"""
Capa de persistencia — SQLite con aiosqlite
Esquema:
  profiles            → perfiles guardados (usuario + interlocutor)
  sessions            → sesiones de conversación
  turns               → cada turno: mensaje interlocutor, 3 sugerencias,
                        respuesta elegida y cómo se eligió
"""
import os
import json
import aiosqlite
from datetime import datetime, timezone

DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "caa_chat.db"))


# ──────────────────────────────────────────────────────────────────────────────
# Inicialización
# ──────────────────────────────────────────────────────────────────────────────

async def seed_default_profiles() -> None:
    """Inserta los perfiles predefinidos si la tabla está vacía."""
    defaults = [
        ("Alex", "user", {
            "name": "Alex", "age": 25,
            "condition": "Trastorno del Espectro Autista (TEA) nivel 1",
            "communication_style": "Comunicación literal y directa. Evita metáforas y lenguaje figurado. Vocabulario sencillo. Frases cortas.",
            "interests": "tecnología, naturaleza, música clásica",
            "sensitivities": "ruido fuerte, cambios de rutina",
        }),
        ("Carla", "user", {
            "name": "Carla", "age": 17,
            "condition": "Trastorno del Espectro Autista (TEA) nivel 2",
            "communication_style": "Comunicación muy concreta. Frases de 3-5 palabras. Usa pictogramas como apoyo. Necesita tiempo para procesar.",
            "interests": "animales, dibujo, series de animación",
            "sensitivities": "multitudes, texturas, contacto físico inesperado",
        }),
        ("María", "interlocutor", {
            "name": "María", "relationship": "madre",
            "communication_style": "Habla de forma natural y afectuosa. Usa frases sencillas. Es paciente y comprensiva.",
            "context": "Conversación en casa después de cenar",
        }),
        ("Lucas", "interlocutor", {
            "name": "Lucas", "relationship": "profesor de apoyo",
            "communication_style": "Habla pausado, con frases claras y estructuradas. Refuerza positivamente.",
            "context": "Clase de apoyo en el aula de recursos",
        }),
    ]
    async with aiosqlite.connect(DB_PATH) as db:
        count = (await (await db.execute("SELECT COUNT(*) FROM profiles")).fetchone())[0]
        if count == 0:
            now = _now()
            await db.executemany(
                "INSERT INTO profiles (name, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                [(name, ptype, json.dumps(data, ensure_ascii=False), now, now)
                 for name, ptype, data in defaults],
            )
            await db.commit()


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript("""
            PRAGMA journal_mode=WAL;

            CREATE TABLE IF NOT EXISTS profiles (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL,
                type        TEXT NOT NULL CHECK(type IN ('user', 'interlocutor')),
                data        TEXT NOT NULL,  -- JSON con todos los campos
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id              TEXT PRIMARY KEY,   -- UUID
                user_profile    TEXT NOT NULL,       -- JSON
                interlocutor_profile TEXT NOT NULL,  -- JSON
                topic           TEXT NOT NULL,
                mode            TEXT NOT NULL CHECK(mode IN ('auto', 'real')),
                wait_seconds    INTEGER NOT NULL DEFAULT 3,
                max_turns       INTEGER NOT NULL,
                started_at      TEXT NOT NULL,
                ended_at        TEXT,
                turn_count      INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS turns (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id          TEXT NOT NULL REFERENCES sessions(id),
                turn_number         INTEGER NOT NULL,
                interlocutor_msg    TEXT NOT NULL,
                suggestion_0        TEXT NOT NULL,
                suggestion_1        TEXT NOT NULL,
                suggestion_2        TEXT NOT NULL,
                chosen_text         TEXT NOT NULL,
                chosen_index        INTEGER NOT NULL,
                chosen_by           TEXT NOT NULL CHECK(chosen_by IN ('auto', 'human')),
                created_at          TEXT NOT NULL
            );
        """)
        await db.commit()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ──────────────────────────────────────────────────────────────────────────────
# Sesiones
# ──────────────────────────────────────────────────────────────────────────────

async def create_session(
    session_id: str,
    user_profile: dict,
    interlocutor_profile: dict,
    topic: str,
    mode: str,
    wait_seconds: int,
    max_turns: int,
) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO sessions
               (id, user_profile, interlocutor_profile, topic, mode,
                wait_seconds, max_turns, started_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                session_id,
                json.dumps(user_profile, ensure_ascii=False),
                json.dumps(interlocutor_profile, ensure_ascii=False),
                topic, mode, wait_seconds, max_turns, _now(),
            ),
        )
        await db.commit()


async def close_session(session_id: str, turn_count: int) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE sessions SET ended_at=?, turn_count=? WHERE id=?",
            (_now(), turn_count, session_id),
        )
        await db.commit()


async def list_sessions() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT id, topic, mode, wait_seconds, max_turns, turn_count,
                      started_at, ended_at,
                      json_extract(user_profile, '$.name') AS user_name,
                      json_extract(interlocutor_profile, '$.name') AS interlocutor_name
               FROM sessions ORDER BY started_at DESC"""
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def get_session(session_id: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM sessions WHERE id=?", (session_id,)
        ) as cur:
            row = await cur.fetchone()
    if row is None:
        return None
    d = dict(row)
    d["user_profile"] = json.loads(d["user_profile"])
    d["interlocutor_profile"] = json.loads(d["interlocutor_profile"])
    return d


# ──────────────────────────────────────────────────────────────────────────────
# Turnos
# ──────────────────────────────────────────────────────────────────────────────

async def save_turn(
    session_id: str,
    turn_number: int,
    interlocutor_msg: str,
    suggestions: list[str],
    chosen_text: str,
    chosen_index: int,
    chosen_by: str,   # 'auto' | 'human'
) -> None:
    s = suggestions + ["", "", ""]   # garantiza al menos 3 elementos
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO turns
               (session_id, turn_number, interlocutor_msg,
                suggestion_0, suggestion_1, suggestion_2,
                chosen_text, chosen_index, chosen_by, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                session_id, turn_number, interlocutor_msg,
                s[0], s[1], s[2],
                chosen_text, chosen_index, chosen_by, _now(),
            ),
        )
        await db.commit()


async def get_turns(session_id: str) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM turns WHERE session_id=? ORDER BY turn_number",
            (session_id,),
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


# ──────────────────────────────────────────────────────────────────────────────
# Perfiles
# ──────────────────────────────────────────────────────────────────────────────

async def save_profile(name: str, profile_type: str, data: dict) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            """INSERT INTO profiles (name, type, data, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?)""",
            (name, profile_type, json.dumps(data, ensure_ascii=False), _now(), _now()),
        )
        await db.commit()
        return cur.lastrowid


async def update_profile(profile_id: int, name: str, data: dict) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE profiles SET name=?, data=?, updated_at=? WHERE id=?",
            (name, json.dumps(data, ensure_ascii=False), _now(), profile_id),
        )
        await db.commit()


async def delete_profile(profile_id: int) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM profiles WHERE id=?", (profile_id,))
        await db.commit()


async def list_profiles(profile_type: str | None = None) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if profile_type:
            async with db.execute(
                "SELECT * FROM profiles WHERE type=? ORDER BY name", (profile_type,)
            ) as cur:
                rows = await cur.fetchall()
        else:
            async with db.execute(
                "SELECT * FROM profiles ORDER BY type, name"
            ) as cur:
                rows = await cur.fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["data"] = json.loads(d["data"])
        result.append(d)
    return result


async def get_profile(profile_id: int) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM profiles WHERE id=?", (profile_id,)
        ) as cur:
            row = await cur.fetchone()
    if row is None:
        return None
    d = dict(row)
    d["data"] = json.loads(d["data"])
    return d
