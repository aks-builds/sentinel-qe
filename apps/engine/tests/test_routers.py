import pytest
from fastapi.testclient import TestClient

from sentinel_engine.main import app

client = TestClient(app)


@pytest.mark.parametrize("module_id", ["probe", "mirror", "guard", "cognify", "reach"])
def test_module_stub_route_responds(module_id: str):
    response = client.get(f"/{module_id}/")
    assert response.status_code == 200
    assert response.json() == {"module": module_id, "status": "not_implemented"}
