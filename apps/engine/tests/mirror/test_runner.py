from sentinel_engine.mirror.providers.base import Message, Provider, ProviderResponse
from sentinel_engine.mirror.runner import run_prompt_suite


class FakeProvider(Provider):
    def __init__(self, responses: list[ProviderResponse]):
        self.responses = responses
        self.calls: list[str] = []

    def complete_conversation(self, messages: list[Message]) -> ProviderResponse:
        # Extract the prompt from the last user message
        for message in reversed(messages):
            if message.role == "user":
                self.calls.append(message.content)
                break
        return self.responses[len(self.calls) - 1]


def test_runs_every_prompt_through_the_provider_in_order():
    provider = FakeProvider(
        [
            ProviderResponse(text="a", input_tokens=1, output_tokens=1),
            ProviderResponse(text="b", input_tokens=2, output_tokens=2),
        ]
    )

    results = run_prompt_suite(provider, ["p1", "p2"])

    assert provider.calls == ["p1", "p2"]
    assert results[0].prompt == "p1"
    assert results[0].text == "a"
    assert results[1].prompt == "p2"
    assert results[1].text == "b"


def test_empty_prompt_list_returns_empty_results_without_calling_the_provider():
    provider = FakeProvider([])

    results = run_prompt_suite(provider, [])

    assert results == []
    assert provider.calls == []
