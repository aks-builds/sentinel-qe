import pytest
from fastapi.testclient import TestClient

from sentinel_engine.judge.base import Judge
from sentinel_engine.main import app
from sentinel_engine.routers.probe import get_judge


class FakeJudge(Judge):
    def __init__(self, response: str):
        self.response = response

    def complete(self, prompt: str) -> str:
        return self.response


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    yield
    app.dependency_overrides.clear()


def test_critique_reasoning_returns_structured_result():
    app.dependency_overrides[get_judge] = lambda: FakeJudge(
        "STEP 1: SUPPORTED - fine\nSTEP 2: UNSUPPORTED - bad"
    )
    client = TestClient(app)

    response = client.post(
        "/probe/hallucination/reasoning",
        json={"steps": ["step one", "step two"], "conclusion": "c"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["hallucination_detected"] is True
    assert len(body["step_critiques"]) == 2
    assert body["step_critiques"][0] == {"step": "step one", "supported": True, "explanation": "fine"}
    assert body["step_critiques"][1] == {"step": "step two", "supported": False, "explanation": "bad"}


def test_critique_reasoning_with_no_hallucinations():
    app.dependency_overrides[get_judge] = lambda: FakeJudge("STEP 1: SUPPORTED - ok")
    client = TestClient(app)

    response = client.post(
        "/probe/hallucination/reasoning",
        json={"steps": ["only step"], "conclusion": "c"},
    )

    assert response.status_code == 200
    assert response.json()["hallucination_detected"] is False


def test_critique_reasoning_rejects_missing_fields():
    client = TestClient(app)

    response = client.post("/probe/hallucination/reasoning", json={"steps": ["a step"]})

    assert response.status_code == 422
