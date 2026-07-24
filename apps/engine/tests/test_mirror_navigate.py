import pytest
from fastapi.testclient import TestClient

from sentinel_engine.main import app
from sentinel_engine.playwright_service.browser import PageContent
from sentinel_engine.routers.mirror import get_page_fetcher


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    yield
    app.dependency_overrides.clear()


def test_navigate_returns_title_and_text():
    app.dependency_overrides[get_page_fetcher] = lambda: (
        lambda url: PageContent(title="t", text="hello")
    )
    client = TestClient(app)

    response = client.post("/mirror/ui/navigate", json={"url": "https://example.com"})

    assert response.status_code == 200
    assert response.json() == {"title": "t", "text": "hello"}


def test_navigate_rejects_missing_url():
    client = TestClient(app)

    response = client.post("/mirror/ui/navigate", json={})

    assert response.status_code == 422
