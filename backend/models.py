from pydantic import BaseModel
from typing import Literal, List, Optional
from enum import Enum


class Role(str, Enum):
    USER = "user"
    INTERLOCUTOR = "interlocutor"
    SYSTEM = "system"


class Mode(str, Enum):
    AUTO = "auto"   # El LLM elige la sugerencia automáticamente
    REAL = "real"   # Un humano real elige la sugerencia (espera activa)


class Message(BaseModel):
    role: Role
    content: str


class UserProfile(BaseModel):
    """Perfil del usuario con dificultades de comunicación (p.e. TEA)"""
    name: str = "Alex"
    age: int = 25
    condition: str = "Trastorno del Espectro Autista (TEA) nivel 1"
    communication_style: str = (
        "Comunicación literal y directa. Evita metáforas y lenguaje figurado. "
        "Vocabulario sencillo. Frases cortas. A veces repite palabras o frases. "
        "Puede tener dificultad para iniciar conversaciones. "
        "Prefiere temas concretos y rutinas conocidas."
    )
    interests: str = "tecnología, naturaleza, música clásica"
    sensitivities: str = "ruido fuerte, cambios de rutina"


class InterlocutorProfile(BaseModel):
    """Perfil del interlocutor (familiar, amigo, etc.)"""
    name: str = "María"
    relationship: str = "madre"
    communication_style: str = (
        "Habla de forma natural y afectuosa. "
        "Usa frases sencillas cuando habla con Alex. "
        "Es paciente y comprensiva."
    )
    context: str = "Conversación en casa después de cenar"


class StartConversationRequest(BaseModel):
    user_profile: Optional[UserProfile] = None
    interlocutor_profile: Optional[InterlocutorProfile] = None
    topic: str = "¿Cómo fue tu día hoy?"
    max_turns: int = 10
    mode: Mode = Mode.AUTO
    wait_seconds: int = 3  # segundos de espera para elección manual


class ConversationEvent(BaseModel):
    type: Literal["interlocutor", "suggestions", "user", "error", "done"]
    content: str | List[str]
    turn: int = 0
    selected_index: Optional[int] = None
    chosen_by: Optional[Literal["auto", "human"]] = None


# ── Modelos para el panel de administración ────────────────────────────────────

class SaveProfileRequest(BaseModel):
    name: str
    type: Literal["user", "interlocutor"]
    data: UserProfile | InterlocutorProfile


class UpdateProfileRequest(BaseModel):
    name: str
    data: UserProfile | InterlocutorProfile
