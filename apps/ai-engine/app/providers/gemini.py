import os

from app.providers.base import LLMProvider


class GeminiProvider(LLMProvider):
    def __init__(self) -> None:
        self.api_key = os.getenv("GEMINI_API_KEY", "")

    async def generate(self, prompt: str) -> str:
        # TODO: wire Google AI Studio API call.
        return f"[Gemini stub] {prompt[:200]}"

    async def extract_json(self, prompt: str) -> dict[str, object]:
        return {"summary": await self.generate(prompt)}

    async def embed(self, text: str) -> list[float]:
        # TODO: replace with local embedding model call.
        return [0.01] * 384
