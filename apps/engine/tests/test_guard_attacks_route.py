from fastapi.testclient import TestClient

from sentinel_engine.main import app


def test_list_attacks_returns_all_23_categorized_attacks():
    client = TestClient(app)

    response = client.get("/guard/attacks")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 23
    assert {"id", "category", "name", "prompt"} <= set(body[0].keys())


def test_list_attacks_includes_every_category():
    client = TestClient(app)

    response = client.get("/guard/attacks")

    categories = {attack["category"] for attack in response.json()}
    assert categories == {
        "prompt_injection",
        "jailbreak_roleplay",
        "authority_impersonation",
        "obfuscation",
        "social_engineering",
    }
