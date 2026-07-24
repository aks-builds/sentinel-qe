import pytest
from fastapi.testclient import TestClient

from sentinel_engine.main import app
from sentinel_engine.mirror.providers.base import Provider, ProviderResponse
from sentinel_engine.routers.mirror import get_provider


class FakeProvider(Provider):
    def __init__(self, responses: list[ProviderResponse]):
        self.responses = responses
        self.calls: list[str] = []

    def complete(self, prompt: str) -> ProviderResponse:
        self.calls.append(prompt)
        return self.responses[len(self.calls) - 1]


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    yield
    app.dependency_overrides.clear()


def test_run_suite_returns_results_for_each_prompt():
    app.dependency_overrides[get_provider] = lambda: FakeProvider(
        [
            ProviderResponse(text="a", input_tokens=1, output_tokens=1),
            ProviderResponse(text="b", input_tokens=2, output_tokens=2),
        ]
    )
    client = TestClient(app)

    response = client.post("/mirror/run", json={"provider": "openai", "prompts": ["p1", "p2"]})

    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "openai"
    assert body["results"] == [
        {"prompt": "p1", "text": "a", "input_tokens": 1, "output_tokens": 1},
        {"prompt": "p2", "text": "b", "input_tokens": 2, "output_tokens": 2},
    ]


def test_run_suite_rejects_unknown_provider():
    client = TestClient(app)

    response = client.post("/mirror/run", json={"provider": "nonexistent", "prompts": ["p1"]})

    assert response.status_code == 400


def test_run_suite_rejects_missing_fields():
    client = TestClient(app)

    response = client.post("/mirror/run", json={"provider": "openai"})

    assert response.status_code == 422
