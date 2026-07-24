import os

import httpx

from .base import Message, Provider, ProviderResponse


class AnthropicProvider(Provider):
    base_url = "https://api.anthropic.com/v1"

    def __init__(self, api_key: str | None = None, model: str = "claude-sonnet-5"):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        self.model = model

    def complete_conversation(self, messages: list[Message]) -> ProviderResponse:
        response = httpx.post(
            f"{self.base_url}/messages",
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": self.model,
                "max_tokens": 1024,
                "messages": [{"role": message.role, "content": message.content} for message in messages],
            },
            timeout=60.0,
        )
        response.raise_for_status()
        data = response.json()
        usage = data.get("usage", {})
        return ProviderResponse(
            text=data["content"][0]["text"],
            input_tokens=usage.get("input_tokens"),
            output_tokens=usage.get("output_tokens"),
        )
