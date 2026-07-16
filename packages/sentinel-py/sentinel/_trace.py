import json
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.error import URLError
from urllib.request import Request, urlopen

from ._client import SentinelConfig, get_config


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _emit_span(payload: dict, config: SentinelConfig) -> None:
    try:
        url = f"{config.endpoint.rstrip('/')}/api/traces"
        request = Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {config.api_key}",
            },
            method="POST",
        )
        urlopen(request, timeout=5)
    except (URLError, ValueError):
        pass


class Trace:
    def __init__(self, name: str):
        self._config = get_config()
        self.name = name
        self.trace_id = uuid.uuid4().hex
        self.span_id = uuid.uuid4().hex
        self._start_time: Optional[str] = None

    def __enter__(self) -> "Trace":
        self._start_time = _now_iso()
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> bool:
        end_time = _now_iso()
        _emit_span(
            {
                "traceId": self.trace_id,
                "spanId": self.span_id,
                "name": self.name,
                "startTime": self._start_time,
                "endTime": end_time,
                "attributes": {"project": self._config.project},
            },
            self._config,
        )
        return False


def trace(name: str) -> Trace:
    return Trace(name)
