from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from sentinel_engine.mirror.providers.anthropic_provider import AnthropicProvider
from sentinel_engine.mirror.providers.base import Provider
from sentinel_engine.mirror.providers.google_provider import GoogleProvider
from sentinel_engine.mirror.providers.grok_provider import GrokProvider
from sentinel_engine.mirror.providers.openai_provider import OpenAIProvider
from sentinel_engine.mirror.runner import run_prompt_suite

router = APIRouter(prefix="/mirror", tags=["mirror"])


@router.get("/")
def mirror_status() -> dict[str, str]:
    return {"module": "mirror", "status": "not_implemented"}


_PROVIDER_CLASSES = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "google": GoogleProvider,
    "grok": GrokProvider,
}


class RunSuiteRequest(BaseModel):
    provider: str
    model: str | None = None
    prompts: list[str]


def get_provider(request: RunSuiteRequest) -> Provider:
    provider_class = _PROVIDER_CLASSES.get(request.provider)
    if provider_class is None:
        raise HTTPException(status_code=400, detail=f'Unknown provider "{request.provider}"')
    return provider_class(model=request.model) if request.model else provider_class()


class PromptResultResponse(BaseModel):
    prompt: str
    text: str
    input_tokens: int | None
    output_tokens: int | None


class RunSuiteResponse(BaseModel):
    provider: str
    results: list[PromptResultResponse]


@router.post("/run", response_model=RunSuiteResponse)
def run_suite(request: RunSuiteRequest, provider: Provider = Depends(get_provider)) -> RunSuiteResponse:
    results = run_prompt_suite(provider, request.prompts)
    return RunSuiteResponse(
        provider=request.provider,
        results=[
            PromptResultResponse(
                prompt=r.prompt, text=r.text, input_tokens=r.input_tokens, output_tokens=r.output_tokens
            )
            for r in results
        ],
    )
