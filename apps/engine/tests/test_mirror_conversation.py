import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from sentinel_engine.main import app
from sentinel_engine.routers.mirror import get_conversation_runner


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    yield
    app.dependency_overrides.clear()


def test_conversation_returns_a_response_per_message():
    app.dependency_overrides[get_conversation_runner] = lambda: (
        lambda product, url, messages: [f"echo:{m}" for m in messages]
    )
    client = TestClient(app)

    response = client.post(
        "/mirror/ui/conversation",
        json={"product": "chatgpt", "url": "file:///x.html", "messages": ["hi", "there"]},
    )

    assert response.status_code == 200
    assert response.json() == {"responses": ["echo:hi", "echo:there"]}


def test_conversation_rejects_missing_fields():
    client = TestClient(app)

    response = client.post("/mirror/ui/conversation", json={"product": "chatgpt"})

    assert response.status_code == 422


def test_default_conversation_runner_rejects_unknown_product():
    runner = get_conversation_runner()

    with pytest.raises(HTTPException):
        runner("unknown-product", "file:///x.html", ["hi"])
