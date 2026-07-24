from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from sentinel_engine.guard.attacks import load_attack_library
from sentinel_engine.guard.multiturn import load_multiturn_attack_library
from sentinel_engine.guard.multiturn_runner import run_multiturn_attack
from sentinel_engine.judge import Judge, get_judge
from sentinel_engine.mirror.providers.anthropic_provider import AnthropicProvider
from sentinel_engine.mirror.providers.base import Provider
from sentinel_engine.mirror.providers.google_provider import GoogleProvider
from sentinel_engine.mirror.providers.grok_provider import GrokProvider
from sentinel_engine.mirror.providers.openai_provider import OpenAIProvider

router = APIRouter(prefix="/guard", tags=["guard"])


@router.get("/")
def guard_status() -> dict[str, str]:
    return {"module": "guard", "status": "not_implemented"}


class AttackResponse(BaseModel):
    id: str
    category: str
    name: str
    prompt: str


@router.get("/attacks", response_model=list[AttackResponse])
def list_attacks() -> list[AttackResponse]:
    return [
        AttackResponse(id=attack.id, category=attack.category, name=attack.name, prompt=attack.prompt)
        for attack in load_attack_library()
    ]


class MultiTurnAttackResponse(BaseModel):
    id: str
    technique: str
    name: str
    turns: list[str]


@router.get("/attacks/multiturn", response_model=list[MultiTurnAttackResponse])
def list_multiturn_attacks() -> list[MultiTurnAttackResponse]:
    return [
        MultiTurnAttackResponse(id=attack.id, technique=attack.technique, name=attack.name, turns=attack.turns)
        for attack in load_multiturn_attack_library()
    ]


_PROVIDER_CLASSES = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "google": GoogleProvider,
    "grok": GrokProvider,
}


class RunMultiTurnAttackRequest(BaseModel):
    provider: str
    model: str | None = None
    attack_id: str


def get_provider_for_multiturn(request: RunMultiTurnAttackRequest) -> Provider:
    provider_class = _PROVIDER_CLASSES.get(request.provider)
    if provider_class is None:
        raise HTTPException(status_code=400, detail=f'Unknown provider "{request.provider}"')
    return provider_class(model=request.model) if request.model else provider_class()


class TurnResultResponse(BaseModel):
    attacker_message: str
    target_response: str
    verdict: str
    reason: str


class RunMultiTurnAttackResponse(BaseModel):
    attack_id: str
    compromised: bool
    turns: list[TurnResultResponse]


@router.post("/attacks/multiturn/run", response_model=RunMultiTurnAttackResponse)
def run_multiturn(
    request: RunMultiTurnAttackRequest,
    provider: Provider = Depends(get_provider_for_multiturn),
    judge: Judge = Depends(get_judge),
) -> RunMultiTurnAttackResponse:
    attack = next((a for a in load_multiturn_attack_library() if a.id == request.attack_id), None)
    if attack is None:
        raise HTTPException(status_code=404, detail=f'Unknown attack id "{request.attack_id}"')

    result = run_multiturn_attack(provider, judge, attack)
    return RunMultiTurnAttackResponse(
        attack_id=result.attack_id,
        compromised=result.compromised,
        turns=[
            TurnResultResponse(
                attacker_message=t.attacker_message,
                target_response=t.target_response,
                verdict=t.verdict,
                reason=t.reason,
            )
            for t in result.turns
        ],
    )
