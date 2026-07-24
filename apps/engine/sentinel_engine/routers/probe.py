import os

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from sentinel_engine.hallucination.communication import detect_communication_hallucination
from sentinel_engine.hallucination.execution import ToolDefinition, detect_execution_hallucination
from sentinel_engine.hallucination.perception import detect_perception_hallucination
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


class ToolDefinitionRequest(BaseModel):
    name: str
    description: str


class ExecutionCritiqueRequest(BaseModel):
    task: str
    available_tools: list[ToolDefinitionRequest]
    selected_tool: str
    parameters_valid: bool
    parameter_errors: list[str] = []


class ExecutionCritiqueResponse(BaseModel):
    correct_tool: str
    tool_selection_correct: bool
    reason: str
    parameters_valid: bool
    parameter_errors: list[str]
    hallucination_detected: bool


@router.post("/hallucination/execution", response_model=ExecutionCritiqueResponse)
def critique_execution(
    request: ExecutionCritiqueRequest, judge: Judge = Depends(get_judge)
) -> ExecutionCritiqueResponse:
    critique = detect_execution_hallucination(
        judge,
        task=request.task,
        available_tools=[ToolDefinition(name=t.name, description=t.description) for t in request.available_tools],
        selected_tool=request.selected_tool,
        parameters_valid=request.parameters_valid,
        parameter_errors=request.parameter_errors,
    )
    return ExecutionCritiqueResponse(
        correct_tool=critique.correct_tool,
        tool_selection_correct=critique.tool_selection_correct,
        reason=critique.reason,
        parameters_valid=critique.parameters_valid,
        parameter_errors=critique.parameter_errors,
        hallucination_detected=critique.hallucination_detected,
    )


class ClaimCritiqueResponse(BaseModel):
    claim: str
    supported: bool
    explanation: str


class PerceptionCritiqueRequest(BaseModel):
    context: str
    claims: list[str]


class PerceptionCritiqueResponse(BaseModel):
    hallucination_detected: bool
    claim_critiques: list[ClaimCritiqueResponse]


@router.post("/hallucination/perception", response_model=PerceptionCritiqueResponse)
def critique_perception(
    request: PerceptionCritiqueRequest, judge: Judge = Depends(get_judge)
) -> PerceptionCritiqueResponse:
    critique = detect_perception_hallucination(judge, request.context, request.claims)
    return PerceptionCritiqueResponse(
        hallucination_detected=critique.hallucination_detected,
        claim_critiques=[
            ClaimCritiqueResponse(claim=c.claim, supported=c.supported, explanation=c.explanation)
            for c in critique.claim_critiques
        ],
    )


class CommunicationCritiqueRequest(BaseModel):
    internal_facts: list[str]
    final_message: str


class CommunicationCritiqueResponse(BaseModel):
    faithful: bool
    reason: str
    hallucination_detected: bool


@router.post("/hallucination/communication", response_model=CommunicationCritiqueResponse)
def critique_communication(
    request: CommunicationCritiqueRequest, judge: Judge = Depends(get_judge)
) -> CommunicationCritiqueResponse:
    critique = detect_communication_hallucination(judge, request.internal_facts, request.final_message)
    return CommunicationCritiqueResponse(
        faithful=critique.faithful,
        reason=critique.reason,
        hallucination_detected=critique.hallucination_detected,
    )
