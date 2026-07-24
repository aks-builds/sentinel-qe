import os

import httpx

from .base import Message, Provider, ProviderResponse


class GoogleProvider(Provider):
    base_url = "https://generativelanguage.googleapis.com/v1beta"

    def __init__(self, api_key: str | None = None, model: str = "gemini-2.0-flash"):
        self.api_key = api_key or os.environ.get("GOOGLE_API_KEY", "")
        self.model = model

    def complete_conversation(self, messages: list[Message]) -> ProviderResponse:
        def to_gemini_role(role: str) -> str:
            return "model" if role == "assistant" else "user"

        response = httpx.post(
            f"{self.base_url}/models/{self.model}:generateContent",
            params={"key": self.api_key},
            json={
                "contents": [
                    {"role": to_gemini_role(message.role), "parts": [{"text": message.content}]}
                    for message in messages
                ]
            },
            timeout=60.0,
        )
        response.raise_for_status()
        data = response.json()
        usage = data.get("usageMetadata", {})
        return ProviderResponse(
            text=data["candidates"][0]["content"]["parts"][0]["text"],
            input_tokens=usage.get("promptTokenCount"),
            output_tokens=usage.get("candidatesTokenCount"),
        )
