import json
from unittest.mock import patch
from urllib.error import URLError

import pytest

import sentinel
import sentinel._client as client_module


@pytest.fixture(autouse=True)
def reset_config():
    client_module._config = None
    yield
    client_module._config = None


def test_trace_requires_init():
    with pytest.raises(RuntimeError, match="sentinel.init"):
        sentinel.trace("run-x")


def test_trace_generates_unique_trace_and_span_ids():
    sentinel.init(endpoint="http://localhost:3000", api_key="sk_test", project="demo-project")

    with sentinel.trace("run-1") as t1:
        pass
    with sentinel.trace("run-2") as t2:
        pass

    assert t1.trace_id != t2.trace_id
    assert t1.span_id != t2.span_id


@patch("sentinel._trace.urlopen")
def test_trace_emits_well_formed_post_body(mock_urlopen):
    sentinel.init(endpoint="http://localhost:3000", api_key="sk_test", project="demo-project")

    with sentinel.trace("run-001") as t:
        pass

    mock_urlopen.assert_called_once()
    request = mock_urlopen.call_args[0][0]

    assert request.full_url == "http://localhost:3000/api/traces"
    assert request.get_header("Content-type") == "application/json"
    assert request.get_header("Authorization") == "Bearer sk_test"

    body = json.loads(request.data)
    assert body["traceId"] == t.trace_id
    assert body["spanId"] == t.span_id
    assert body["name"] == "run-001"
    assert body["attributes"] == {"project": "demo-project"}
    assert "startTime" in body
    assert "endTime" in body


@patch("sentinel._trace.urlopen", side_effect=URLError("boom"))
def test_trace_swallows_network_errors(mock_urlopen):
    sentinel.init(endpoint="http://localhost:3000", api_key="sk_test", project="demo-project")

    with sentinel.trace("run-002"):
        pass  # must not raise even though urlopen raised URLError


def test_trace_swallows_malformed_endpoint_errors():
    # A scheme-less endpoint (e.g. "localhost" instead of "http://localhost:3000")
    # makes urllib.request.Request itself raise ValueError before urlopen is ever
    # called -- this must be swallowed just like a network failure.
    sentinel.init(endpoint="localhost", api_key="sk_test", project="demo-project")

    with sentinel.trace("run-003"):
        pass  # must not raise even though Request() raised ValueError
