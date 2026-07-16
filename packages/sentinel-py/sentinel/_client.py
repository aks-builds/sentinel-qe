from dataclasses import dataclass
from typing import Optional


@dataclass
class SentinelConfig:
    endpoint: str
    api_key: str
    project: str


_config: Optional[SentinelConfig] = None


def init(endpoint: str, api_key: str, project: str) -> None:
    global _config
    _config = SentinelConfig(endpoint=endpoint, api_key=api_key, project=project)


def get_config() -> SentinelConfig:
    if _config is None:
        raise RuntimeError("sentinel.init() must be called before sentinel.trace()")
    return _config
