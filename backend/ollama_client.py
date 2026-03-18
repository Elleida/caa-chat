"""
Cliente async para la API de Ollama (http://gtc2pc9.cps.unizar.es:11434)
"""
import os
import httpx
import json
from typing import AsyncGenerator, List, Dict
from dotenv import load_dotenv

load_dotenv()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://gtc2pc9.cps.unizar.es:11434")
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "gemma3:27b")


async def chat_completion(
    messages: List[Dict[str, str]],
    model: str = DEFAULT_MODEL,
    temperature: float = 0.7,
    stream: bool = False,
) -> str:
    """Llamada síncrona (recibe respuesta completa) a Ollama /api/chat."""
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": 512,
        },
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
        )
        response.raise_for_status()
        data = response.json()
        return data["message"]["content"].strip()


async def chat_stream(
    messages: List[Dict[str, str]],
    model: str = DEFAULT_MODEL,
    temperature: float = 0.7,
) -> AsyncGenerator[str, None]:
    """Llamada streaming a Ollama /api/chat."""
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "options": {
            "temperature": temperature,
            "num_predict": 512,
        },
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line:
                    chunk = json.loads(line)
                    token = chunk.get("message", {}).get("content", "")
                    if token:
                        yield token
                    if chunk.get("done"):
                        break


async def check_model_available(model: str = DEFAULT_MODEL) -> bool:
    """Comprueba si el modelo está disponible en Ollama."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            response.raise_for_status()
            models = [m["name"] for m in response.json().get("models", [])]
            return any(model in m for m in models)
    except Exception:
        return False
