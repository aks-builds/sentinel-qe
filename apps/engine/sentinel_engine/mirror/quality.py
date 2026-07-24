import re
from dataclasses import dataclass

from sentinel_engine.judge.base import Judge

_SCORE_PATTERNS = {
    "correctness": re.compile(r"CORRECTNESS:\s*(\d)", re.IGNORECASE),
    "relevance": re.compile(r"RELEVANCE:\s*(\d)", re.IGNORECASE),
    "tone": re.compile(r"TONE:\s*(\d)", re.IGNORECASE),
}
_REASON_PATTERN = re.compile(r"REASON:\s*(.+)", re.IGNORECASE)


@dataclass
class QualityScore:
    correctness: int | None
    relevance: int | None
    tone: int | None
    reason: str


def _build_prompt(prompt: str, response: str, expected_answer: str | None) -> str:
    expected_section = f"\n\nExpected/reference answer: {expected_answer}" if expected_answer else ""
    correctness_question = "is the response factually accurate"
    if expected_answer:
        correctness_question += " and consistent with the expected answer"
    correctness_question += "?"

    return (
        "You are scoring an AI system's response to a prompt on three dimensions, "
        "each on a scale of 1 (poor) to 5 (excellent).\n\n"
        f"Prompt: {prompt}\n\n"
        f"Response: {response}"
        f"{expected_section}\n\n"
        f"CORRECTNESS: {correctness_question}\n"
        "RELEVANCE: does the response actually address the prompt?\n"
        "TONE: is the tone appropriate and professional?\n\n"
        "Respond in EXACTLY this format (no extra text):\n"
        "CORRECTNESS: <1-5>\n"
        "RELEVANCE: <1-5>\n"
        "TONE: <1-5>\n"
        "REASON: <one sentence>"
    )


def score_quality(
    judge: Judge, prompt: str, response: str, expected_answer: str | None = None
) -> QualityScore:
    judge_prompt = _build_prompt(prompt, response, expected_answer)
    raw = judge.complete(judge_prompt)

    scores: dict[str, int | None] = {}
    for dimension, pattern in _SCORE_PATTERNS.items():
        match = pattern.search(raw)
        scores[dimension] = int(match.group(1)) if match else None

    reason_match = _REASON_PATTERN.search(raw)
    if reason_match:
        reason = reason_match.group(1).strip()
    elif all(value is None for value in scores.values()):
        reason = "Could not parse a judge response."
    else:
        reason = ""

    return QualityScore(
        correctness=scores["correctness"],
        relevance=scores["relevance"],
        tone=scores["tone"],
        reason=reason,
    )
