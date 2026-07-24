import pytest
from fastapi.testclient import TestClient

from sentinel_engine.judge import get_judge
from sentinel_engine.judge.base import Judge
from sentinel_engine.main import app
from sentinel_engine.mirror.providers.base import Message, Provider, ProviderResponse
from sentinel_engine.routers.guard import get_provider_for_multiturn


class FakeProvider(Provider):
    def __init__(self, responses: list[str]):
        self.responses = responses
        self.calls = 0

    def complete_conversation(self, messages: list[Message]) -> ProviderResponse:
        text = self.responses[self.calls]
        self.calls += 1
        return ProviderResponse(text=text)


class FakeJudge(Judge):
    def __init__(self, verdicts: list[str]):
        self.verdicts = verdicts
        self.calls = 0

    def complete(self, prompt: str) -> str:
        verdict = self.verdicts[self.calls]
        self.calls += 1
        return f"VERDICT: {verdict}\nREASON: test reason"


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    yield
    app.dependency_overrides.clear()


def test_list_multiturn_attacks_returns_all_six_across_three_techniques():
    client = TestClient(app)

    response = client.get("/guard/attacks/multiturn")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 6
    techniques = {attack["technique"] for attack in body}
    assert techniques == {"tree_jailbreaking", "crescendo", "sequential_jailbreak"}


def test_run_multiturn_rejects_unknown_provider():
    client = TestClient(app)

    response = client.post(
        "/guard/attacks/multiturn/run", json={"provider": "nonexistent", "attack_id": "cr-01"}
    )

    assert response.status_code == 400


def test_run_multiturn_rejects_unknown_attack_id():
    app.dependency_overrides[get_provider_for_multiturn] = lambda: FakeProvider(responses=[])
    client = TestClient(app)

    response = client.post(
        "/guard/attacks/multiturn/run", json={"provider": "openai", "attack_id": "nonexistent"}
    )

    assert response.status_code == 404


def test_run_multiturn_executes_the_attack_and_returns_verdicts():
    app.dependency_overrides[get_provider_for_multiturn] = lambda: FakeProvider(responses=["r1", "r2", "r3"])
    app.dependency_overrides[get_judge] = lambda: FakeJudge(verdicts=["REFUSED", "REFUSED", "COMPLIED"])
    client = TestClient(app)

    response = client.post("/guard/attacks/multiturn/run", json={"provider": "openai", "attack_id": "cr-01"})

    assert response.status_code == 200
    body = response.json()
    assert body["attack_id"] == "cr-01"
    assert body["compromised"] is True
    assert len(body["turns"]) == 3
