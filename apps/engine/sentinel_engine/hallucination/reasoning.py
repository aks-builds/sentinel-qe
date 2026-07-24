import re
from dataclasses import dataclass

from sentinel_engine.judge.base import Judge

_STEP_LINE_PATTERN = re.compile(r"STEP\s+(\d+):\s*(SUPPORTED|UNSUPPORTED)\s*-\s*(.+)", re.IGNORECASE)


@dataclass
class StepCritique:
    step: str
    supported: bool
    explanation: str


@dataclass
class ReasoningCritique:
    step_critiques: list[StepCritique]

    @property
    def hallucination_detected(self) -> bool:
        return any(not critique.supported for critique in self.step_critiques)


def _build_prompt(steps: list[str], conclusion: str) -> str:
    numbered_steps = "\n".join(f"{i + 1}. {step}" for i, step in enumerate(steps))
    return (
        "You are evaluating the reasoning steps an AI agent used before its conclusion, "
        "checking for hallucinations: claims not justified by prior steps or general "
        "knowledge, or that contradict an earlier step.\n\n"
        f"Conclusion: {conclusion}\n\n"
        f"Steps:\n{numbered_steps}\n\n"
        "For EACH step, respond on its own line in EXACTLY this format (no extra text):\n"
        "STEP <n>: SUPPORTED|UNSUPPORTED - <one sentence reason>"
    )


def detect_reasoning_hallucination(judge: Judge, steps: list[str], conclusion: str) -> ReasoningCritique:
    if not steps:
        return ReasoningCritique(step_critiques=[])

    prompt = _build_prompt(steps, conclusion)
    response = judge.complete(prompt)

    verdicts_by_step_number: dict[int, tuple[bool, str]] = {}
    for line in response.splitlines():
        match = _STEP_LINE_PATTERN.search(line)
        if not match:
            continue
        step_number = int(match.group(1))
        supported = match.group(2).upper() == "SUPPORTED"
        explanation = match.group(3).strip()
        verdicts_by_step_number[step_number] = (supported, explanation)

    critiques = []
    for index, step in enumerate(steps):
        step_number = index + 1
        if step_number in verdicts_by_step_number:
            supported, explanation = verdicts_by_step_number[step_number]
        else:
            supported, explanation = False, "Could not parse a judge verdict for this step."
        critiques.append(StepCritique(step=step, supported=supported, explanation=explanation))

    return ReasoningCritique(step_critiques=critiques)
