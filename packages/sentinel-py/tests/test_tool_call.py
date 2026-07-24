import json
from urllib.error import URLError
from unittest.mock import patch

import pytest

import sentinel
import sentinel._client as client_module


@pytest.fixture(autouse=True)
def reset_config():
    client_module._config = None
    yield
    client_module._config = None


DECLARED_SCHEMA = {
    "type": "object",
    "required": ["order_id"],
    "properties": {"order_id": {"type": "string"}},
}


@patch("sentinel._trace.urlopen")
def test_tool_call_emits_child_span_with_validation_result(mock_urlopen):
    sentinel.init(endpoint="http://localhost:3000", api_key="sk_test", project="demo-project")

    with sentinel.trace("run-001") as t:
        result = t.tool_call("search_orders", DECLARED_SCHEMA, {"order_id": "12345"})

    assert result.valid is True
    assert result.errors == []

    # two spans emitted: the tool_call span (first), then the trace's own span on __exit__
    assert mock_urlopen.call_count == 2
    tool_call_request = mock_urlopen.call_args_list[0][0][0]
    body = json.loads(tool_call_request.data)

    assert body["traceId"] == t.trace_id
    assert body["parentSpanId"] == t.span_id
    assert body["spanId"] != t.span_id
    assert body["name"] == "tool_call:search_orders"
    assert body["attributes"]["toolName"] == "search_orders"
    assert body["attributes"]["valid"] is True
    assert body["attributes"]["errors"] == []
    assert body["attributes"]["declaredSchema"] == DECLARED_SCHEMA
    assert body["attributes"]["actualParameters"] == {"order_id": "12345"}


@patch("sentinel._trace.urlopen")
def test_tool_call_reports_schema_violations(mock_urlopen):
    sentinel.init(endpoint="http://localhost:3000", api_key="sk_test", project="demo-project")

    with sentinel.trace("run-002") as t:
        result = t.tool_call("search_orders", DECLARED_SCHEMA, {})

    assert result.valid is False
    assert result.errors == ["root.order_id: required property missing"]

    tool_call_request = mock_urlopen.call_args_list[0][0][0]
    body = json.loads(tool_call_request.data)
    assert body["attributes"]["valid"] is False
    assert body["attributes"]["errors"] == ["root.order_id: required property missing"]


@patch("sentinel._trace.urlopen", side_effect=URLError("boom"))
def test_tool_call_never_raises_on_emit_failure(mock_urlopen):
    sentinel.init(endpoint="http://localhost:3000", api_key="sk_test", project="demo-project")

    with sentinel.trace("run-003") as t:
        result = t.tool_call("search_orders", {"type": "object"}, {})  # must not raise

    assert result.valid is True  # bare {"type": "object"} has no required/properties to violate
