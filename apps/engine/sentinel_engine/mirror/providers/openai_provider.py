import os

import httpx

from .base import Provider, ProviderResponse


class OpenAIProvider(Provider):
    base_url = "https://api.openai.com/v1"

    def __init__(self, api_key: str | None = None, model: str = "gpt-4o-mini"):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY", "")
        self.model = model

    def complete(self, prompt: str) -> ProviderResponse:
        response = httpx.post(
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={"model": self.model, "messages": [{"role": "user", "content": prompt}]},
            timeout=60.0,
        )
        response.raise_for_status()
        data = response.json()
        usage = data.get("usage", {})
        return ProviderResponse(
            text=data["choices"][0]["message"]["content"],
            input_tokens=usage.get("prompt_tokens"),
            output_tokens=usage.get("completion_tokens"),
        )
