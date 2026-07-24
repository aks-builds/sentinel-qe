from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class Message:
    role: str
    content: str


@dataclass
class ProviderResponse:
    text: str
    input_tokens: int | None = None
    output_tokens: int | None = None


class Provider(ABC):
    """A single external AI provider's chat-completion API.

    Mirror tests AI products the customer already sends data to as part of
    normal usage -- calling these providers directly IS the feature under
    test, unlike Probe/Guard/Cognify/Reach's self-hosted Judge (design spec
    section 12). No local-first constraint applies here.
    """

    @abstractmethod
    def complete_conversation(self, messages: list[Message]) -> ProviderResponse:
        """Send the full conversation history so far and return the next response."""

    def complete(self, prompt: str) -> ProviderResponse:
        """Send a single prompt with no prior history."""
        return self.complete_conversation([Message(role="user", content=prompt)])
