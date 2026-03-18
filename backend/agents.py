"""
Tres agentes LLM que gestionan la conversación:
  1. InterlocutorAgent  — simula al familiar/amigo
  2. GestorAgent        — sugiere 3 respuestas para el usuario
  3. UserAgent          — simula al usuario con TEA eligiendo una sugerencia
"""
import re
from typing import List, Dict
from models import UserProfile, InterlocutorProfile, Message, Role
import ollama_client as llm


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _build_history(messages: List[Message], from_perspective: Role) -> List[Dict[str, str]]:
    """
    Convierte la lista de mensajes en el formato que espera Ollama.
    Desde la perspectiva de `from_perspective`, ese rol es 'assistant'
    y el otro es 'user'.
    """
    result = []
    for m in messages:
        if m.role == from_perspective:
            result.append({"role": "assistant", "content": m.content})
        elif m.role in (Role.USER, Role.INTERLOCUTOR):
            result.append({"role": "user", "content": m.content})
    return result


# ──────────────────────────────────────────────────────────────────────────────
# 1. Agente Interlocutor
# ──────────────────────────────────────────────────────────────────────────────

class InterlocutorAgent:
    """Simula al interlocutor (familiar, amigo…)."""

    def __init__(self, profile: InterlocutorProfile, user_profile: UserProfile):
        self.profile = profile
        self.system_prompt = f"""Eres {profile.name}, {profile.relationship} de {user_profile.name}.
{profile.context}.

Tu estilo de comunicación: {profile.communication_style}

Estás hablando con {user_profile.name}, quien tiene {user_profile.condition}.
Ten en cuenta que {user_profile.name} puede necesitar frases sencillas y directas.

IMPORTANTE:
- Responde SOLO con tu mensaje, sin explicaciones adicionales.
- Mantén respuestas cortas (1-3 frases).
- Sé natural y afectuoso/a.
- No uses emojis.
"""

    async def respond(self, history: List[Message]) -> str:
        messages = [{"role": "system", "content": self.system_prompt}]
        messages += _build_history(history, from_perspective=Role.INTERLOCUTOR)
        response = await llm.chat_completion(messages, temperature=0.8)
        return response


# ──────────────────────────────────────────────────────────────────────────────
# 2. Agente Gestor de sugerencias
# ──────────────────────────────────────────────────────────────────────────────

class GestorAgent:
    """Genera 3 sugerencias de respuesta adaptadas al usuario con TEA."""

    def __init__(self, user_profile: UserProfile, interlocutor_profile: InterlocutorProfile):
        self.user_profile = user_profile
        self.interlocutor_profile = interlocutor_profile
        self.system_prompt = f"""Eres un sistema de apoyo a la comunicación aumentativa y alternativa (CAA).
Tu tarea es ayudar a {user_profile.name} ({user_profile.condition}) a comunicarse.

Perfil de {user_profile.name}:
- Edad: {user_profile.age} años
- Estilo comunicativo: {user_profile.communication_style}
- Intereses: {user_profile.interests}
- Sensibilidades: {user_profile.sensitivities}

Interlocutor: {interlocutor_profile.name} ({interlocutor_profile.relationship})
Contexto: {interlocutor_profile.context}

Tu misión: Dado el mensaje más reciente de {interlocutor_profile.name}, genera EXACTAMENTE 3 sugerencias
de respuesta para {user_profile.name}.

REGLAS para las sugerencias:
1. Usa vocabulario sencillo y frases cortas (máximo 15 palabras cada una).
2. Evita metáforas, ironía o lenguaje figurado.
3. Las tres opciones deben cubrir diferentes intenciones:
   - Opción 1: respuesta informativa/descriptiva
   - Opción 2: respuesta emocional/afectiva breve
   - Opción 3: pregunta o solicitud de aclaración
4. Sé fiel al perfil y los intereses de {user_profile.name}.

Formato de respuesta (OBLIGATORIO, sin texto adicional):
1. [primera sugerencia]
2. [segunda sugerencia]
3. [tercera sugerencia]
"""

    async def suggest(self, history: List[Message], last_interlocutor_msg: str) -> List[str]:
        # Construir historial de conversación como contexto
        history_text = "\n".join(
            f"{m.role.value.upper()}: {m.content}" for m in history[-8:]
        )
        user_messages = [
            {"role": "system", "content": self.system_prompt},
            {
                "role": "user",
                "content": (
                    f"Historial reciente:\n{history_text}\n\n"
                    f"Último mensaje de {self.interlocutor_profile.name}:\n"
                    f'"{last_interlocutor_msg}"\n\n'
                    f"Genera las 3 sugerencias para {self.user_profile.name}:"
                ),
            },
        ]
        response = await llm.chat_completion(user_messages, temperature=0.6)
        return self._parse_suggestions(response)

    def _parse_suggestions(self, raw: str) -> List[str]:
        """Extrae las 3 sugerencias numeradas del texto."""
        lines = raw.strip().split("\n")
        suggestions = []
        pattern = re.compile(r"^\s*\d+[\.\)]\s*(.+)$")
        for line in lines:
            m = pattern.match(line)
            if m:
                suggestions.append(m.group(1).strip())
        # Fallback: si el parsing falla, devuelve líneas no vacías
        if len(suggestions) < 3:
            suggestions = [l.strip() for l in lines if l.strip()][:3]
        return suggestions[:3]


# ──────────────────────────────────────────────────────────────────────────────
# 3. Agente Usuario (elige una sugerencia)
# ──────────────────────────────────────────────────────────────────────────────

class UserAgent:
    """
    Simula al usuario con TEA. Recibe las 3 sugerencias del gestor
    y elige la más apropiada según el contexto.
    En modo automático, el LLM decide cuál es más adecuada.
    """

    def __init__(self, profile: UserProfile, interlocutor_profile: InterlocutorProfile):
        self.profile = profile
        self.interlocutor_profile = interlocutor_profile
        self.system_prompt = f"""Eres {profile.name}, una persona de {profile.age} años con {profile.condition}.
Tu forma de comunicarte: {profile.communication_style}
Tus intereses: {profile.interests}

Vas a recibir 3 opciones de respuesta y debes elegir la que más se adapte a cómo te sentirías
y a lo que querrías decir realmente en ese momento.

IMPORTANTE: Responde ÚNICAMENTE con el número de la opción elegida (1, 2 o 3).
No añadas ningún texto adicional.
"""

    async def choose(
        self,
        suggestions: List[str],
        last_interlocutor_msg: str,
        history: List[Message],
    ) -> tuple[str, int]:
        """Devuelve (texto de la respuesta elegida, índice 0-based)."""
        options_text = "\n".join(f"{i+1}. {s}" for i, s in enumerate(suggestions))
        history_text = "\n".join(
            f"{m.role.value.upper()}: {m.content}" for m in history[-6:]
        )
        messages = [
            {"role": "system", "content": self.system_prompt},
            {
                "role": "user",
                "content": (
                    f"Contexto reciente:\n{history_text}\n\n"
                    f"{self.interlocutor_profile.name} ha dicho:\n"
                    f'"{last_interlocutor_msg}"\n\n'
                    f"Tus opciones de respuesta:\n{options_text}\n\n"
                    f"¿Cuál eliges? Responde solo con el número:"
                ),
            },
        ]
        response = await llm.chat_completion(messages, temperature=0.3)
        idx = self._parse_choice(response, len(suggestions))
        return suggestions[idx], idx

    def _parse_choice(self, raw: str, n: int) -> int:
        """Extrae el índice (0-based) de la elección."""
        raw = raw.strip()
        # Buscar primer dígito válido
        for char in raw:
            if char.isdigit():
                choice = int(char)
                if 1 <= choice <= n:
                    return choice - 1
        return 0  # fallback: primera sugerencia
