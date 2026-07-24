import os

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from sentinel_engine.hallucination.reasoning import detect_reasoning_hallucination
from sentinel_engine.judge.base import Judge
from sentinel_engine.judge.ollama_judge import OllamaJudge

router = APIRouter(prefix="/probe", tags=["probe"])


@router.get("/")
def probe_status() -> dict[str, str]:
    return {"module": "probe", "status": "not_implemented"}


def get_judge() -> Judge:
    return OllamaJudge(
        base_url=os.environ.get("OLLAMA_URL", "http://localhost:11434"),
        model=os.environ.get("OLLAMA_MODEL", "llama3.2:3b"),
    )


class StepCritiqueResponse(BaseModel):
    step: str
    supported: bool
    explanation: str


class ReasoningCritiqueRequest(BaseModel):
    steps: list[str]
    conclusion: str


class ReasoningCritiqueResponse(BaseModel):
    hallucination_detected: bool
    step_critiques: list[StepCritiqueResponse]


@router.post("/hallucination/reasoning", response_model=ReasoningCritiqueResponse)
def critique_reasoning(
    request: ReasoningCritiqueRequest, judge: Judge = Depends(get_judge)
) -> ReasoningCritiqueResponse:
    critique = detect_reasoning_hallucination(judge, request.steps, request.conclusion)
    return ReasoningCritiqueResponse(
        hallucination_detected=critique.hallucination_detected,
        step_critiques=[
            StepCritiqueResponse(step=c.step, supported=c.supported, explanation=c.explanation)
            for c in critique.step_critiques
        ],
    )
