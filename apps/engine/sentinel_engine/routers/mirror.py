from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from sentinel_engine.judge import Judge, get_judge
from sentinel_engine.playwright_service.browser import PageContent, fetch_page_content
from sentinel_engine.playwright_service.conversation import chatgpt_session, claude_session
from sentinel_engine.mirror.providers.anthropic_provider import AnthropicProvider
from sentinel_engine.mirror.providers.base import Provider
from sentinel_engine.mirror.providers.google_provider import GoogleProvider
from sentinel_engine.mirror.providers.grok_provider import GrokProvider
from sentinel_engine.mirror.providers.openai_provider import OpenAIProvider
from sentinel_engine.mirror.quality import score_quality
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


class ScoreResponseRequest(BaseModel):
    prompt: str
    response: str
    expected_answer: str | None = None


class ScoreResponseResponse(BaseModel):
    correctness: int | None
    relevance: int | None
    tone: int | None
    reason: str


@router.post("/score", response_model=ScoreResponseResponse)
def score(request: ScoreResponseRequest, judge: Judge = Depends(get_judge)) -> ScoreResponseResponse:
    result = score_quality(judge, request.prompt, request.response, request.expected_answer)
    return ScoreResponseResponse(
        correctness=result.correctness,
        relevance=result.relevance,
        tone=result.tone,
        reason=result.reason,
    )


class NavigateRequest(BaseModel):
    url: str


class NavigateResponse(BaseModel):
    title: str
    text: str


def get_page_fetcher():
    return fetch_page_content


@router.post("/ui/navigate", response_model=NavigateResponse)
def navigate(request: NavigateRequest, fetcher=Depends(get_page_fetcher)) -> NavigateResponse:
    content: PageContent = fetcher(request.url)
    return NavigateResponse(title=content.title, text=content.text)


class ConversationRequest(BaseModel):
    product: str
    url: str
    messages: list[str]


class ConversationResponse(BaseModel):
    responses: list[str]


_CONVERSATION_SESSION_FACTORIES = {
    "chatgpt": chatgpt_session,
    "claude": claude_session,
}


def get_conversation_runner():
    def run(product: str, url: str, messages: list[str]) -> list[str]:
        factory = _CONVERSATION_SESSION_FACTORIES.get(product)
        if factory is None:
            raise HTTPException(status_code=400, detail=f'Unknown product "{product}"')
        with factory(url) as session:
            return [session.send_message(message) for message in messages]

    return run


@router.post("/ui/conversation", response_model=ConversationResponse)
def conversation(
    request: ConversationRequest, runner=Depends(get_conversation_runner)
) -> ConversationResponse:
    responses = runner(request.product, request.url, request.messages)
    return ConversationResponse(responses=responses)
