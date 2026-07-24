from abc import ABC, abstractmethod
from dataclasses import dataclass


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
    def complete(self, prompt: str) -> ProviderResponse:
        """Send a single prompt to the provider and return its response."""
