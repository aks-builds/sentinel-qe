import os

from .base import Judge
from .ollama_judge import OllamaJudge


def get_judge() -> Judge:
    return OllamaJudge(
        base_url=os.environ.get("OLLAMA_URL", "http://localhost:11434"),
        model=os.environ.get("OLLAMA_MODEL", "llama3.2:3b"),
    )
