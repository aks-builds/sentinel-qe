import os

from .openai_provider import OpenAIProvider


class GrokProvider(OpenAIProvider):
    base_url = "https://api.x.ai/v1"

    def __init__(self, api_key: str | None = None, model: str = "grok-2-latest"):
        super().__init__(api_key=api_key or os.environ.get("GROK_API_KEY", ""), model=model)
