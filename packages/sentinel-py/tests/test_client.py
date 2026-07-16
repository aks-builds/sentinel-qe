import pytest

import sentinel
import sentinel._client as client_module


@pytest.fixture(autouse=True)
def reset_config():
    client_module._config = None
    yield
    client_module._config = None


def test_init_stores_config():
    sentinel.init(endpoint="http://localhost:3000", api_key="sk_test", project="demo-project")

    config = client_module.get_config()

    assert config.endpoint == "http://localhost:3000"
    assert config.api_key == "sk_test"
    assert config.project == "demo-project"


def test_get_config_raises_before_init():
    with pytest.raises(RuntimeError, match="sentinel.init"):
        client_module.get_config()
