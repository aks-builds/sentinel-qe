from abc import ABC, abstractmethod


class Judge(ABC):
    """A pluggable text-completion backend used to critique agent behavior.

    The default (and only) implementation is self-hosted (OllamaJudge) --
    never a paid cloud API by default. See design spec section 12.
    """

    @abstractmethod
    def complete(self, prompt: str) -> str:
        """Send a prompt to the judge model and return its raw text completion."""
