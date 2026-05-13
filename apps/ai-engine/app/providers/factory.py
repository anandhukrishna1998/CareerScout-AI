import os

from app.providers.base import LLMProvider
from app.providers.gemini import GeminiProvider


def get_provider() -> LLMProvider:
    provider = os.getenv("LLM_PROVIDER", "gemini").lower()
    if provider == "gemini":
        return GeminiProvider()
    raise ValueError(f"Unsupported provider: {provider}")
