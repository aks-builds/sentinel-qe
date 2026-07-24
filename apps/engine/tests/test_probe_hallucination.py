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


def test_critique_execution_returns_structured_result():
    app.dependency_overrides[get_judge] = lambda: FakeJudge(
        "CORRECT_TOOL: search_orders\nREASON: Correct tool for a lookup task."
    )
    client = TestClient(app)

    response = client.post(
        "/probe/hallucination/execution",
        json={
            "task": "Look up order #12345",
            "available_tools": [
                {"name": "search_orders", "description": "Look up an order by ID."},
                {"name": "refund_order", "description": "Issue a refund."},
            ],
            "selected_tool": "search_orders",
            "parameters_valid": True,
            "parameter_errors": [],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["hallucination_detected"] is False
    assert body["tool_selection_correct"] is True
    assert body["correct_tool"] == "search_orders"


def test_critique_execution_flags_invalid_parameters():
    app.dependency_overrides[get_judge] = lambda: FakeJudge(
        "CORRECT_TOOL: search_orders\nREASON: Correct tool."
    )
    client = TestClient(app)

    response = client.post(
        "/probe/hallucination/execution",
        json={
            "task": "Look up order #12345",
            "available_tools": [{"name": "search_orders", "description": "Look up an order by ID."}],
            "selected_tool": "search_orders",
            "parameters_valid": False,
            "parameter_errors": ["root.order_id: required property missing"],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["hallucination_detected"] is True
    assert body["parameter_errors"] == ["root.order_id: required property missing"]


def test_critique_execution_rejects_missing_fields():
    client = TestClient(app)

    response = client.post("/probe/hallucination/execution", json={"task": "t"})

    assert response.status_code == 422


def test_critique_perception_returns_structured_result():
    app.dependency_overrides[get_judge] = lambda: FakeJudge(
        "CLAIM 1: SUPPORTED - ok\nCLAIM 2: UNSUPPORTED - not in context"
    )
    client = TestClient(app)

    response = client.post(
        "/probe/hallucination/perception",
        json={"context": "some retrieved text", "claims": ["claim one", "claim two"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["hallucination_detected"] is True
    assert len(body["claim_critiques"]) == 2


def test_critique_perception_rejects_missing_fields():
    client = TestClient(app)

    response = client.post("/probe/hallucination/perception", json={"context": "c"})

    assert response.status_code == 422


def test_critique_communication_returns_structured_result():
    app.dependency_overrides[get_judge] = lambda: FakeJudge("VERDICT: UNFAITHFUL\nREASON: contradiction")
    client = TestClient(app)

    response = client.post(
        "/probe/hallucination/communication",
        json={"internal_facts": ["fact one"], "final_message": "a message"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["hallucination_detected"] is True
    assert body["faithful"] is False
    assert body["reason"] == "contradiction"


def test_critique_communication_rejects_missing_fields():
    client = TestClient(app)

    response = client.post("/probe/hallucination/communication", json={"internal_facts": ["f"]})

    assert response.status_code == 422
