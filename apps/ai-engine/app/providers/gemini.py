import hashlib
import json
import os
import re

import httpx

from app.providers.base import LLMProvider

_PLACEHOLDER_KEYS = {"", "your-gemini-key", "replace-me", "changeme", "none", "null"}


class GeminiProvider(LLMProvider):
    def __init__(self) -> None:
        self.api_key = os.getenv("GEMINI_API_KEY", "").strip()
        self.model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
        self.embed_model = os.getenv("GEMINI_EMBED_MODEL", "text-embedding-004").strip()

    @property
    def is_configured(self) -> bool:
        return self.api_key.lower() not in _PLACEHOLDER_KEYS

    async def generate(self, prompt: str) -> str:
        if not self.is_configured:
            return ""
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent?key={self.api_key}"
        )
        payload = {"contents": [{"parts": [{"text": prompt}]}]}
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
            candidates = data.get("candidates") or []
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                return "".join(str(p.get("text", "")) for p in parts).strip()
        except Exception:
            return ""
        return ""

    async def extract_json(self, prompt: str) -> dict[str, object]:
        text = await self.generate(prompt)
        if text:
            cleaned = re.sub(r"^```json\s*|\s*```$", "", text.strip(), flags=re.IGNORECASE)
            try:
                parsed = json.loads(cleaned)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                pass
        return {"summary": text}

    async def embed(self, text: str) -> list[float]:
        if self.is_configured:
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{self.embed_model}:embedContent?key={self.api_key}"
            )
            payload = {"content": {"parts": [{"text": text[:4000]}]}}
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    resp = await client.post(url, json=payload)
                    resp.raise_for_status()
                    values = resp.json().get("embedding", {}).get("values")
                    if isinstance(values, list) and values:
                        return [float(v) for v in values]
            except Exception:
                pass

        # Deterministic normalized hash embedding fallback (384 dims)
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        return [round(((digest[i % len(digest)] / 255.0) * 2.0) - 1.0, 4) for i in range(384)]
