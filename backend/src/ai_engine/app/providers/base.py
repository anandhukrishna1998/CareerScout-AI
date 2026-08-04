from typing import Protocol


class LLMProvider(Protocol):
    async def generate(self, prompt: str) -> str:
        ...

    async def extract_json(self, prompt: str) -> dict[str, object]:
        ...

    async def embed(self, text: str) -> list[float]:
        ...
