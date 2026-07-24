import re
from dataclasses import dataclass

from sentinel_engine.judge.base import Judge

_CLAIM_LINE_PATTERN = re.compile(r"CLAIM\s+(\d+):\s*(SUPPORTED|UNSUPPORTED)\s*-\s*(.+)", re.IGNORECASE)


@dataclass
class ClaimCritique:
    claim: str
    supported: bool
    explanation: str


@dataclass
class PerceptionCritique:
    claim_critiques: list[ClaimCritique]

    @property
    def hallucination_detected(self) -> bool:
        return any(not critique.supported for critique in self.claim_critiques)


def _build_prompt(context: str, claims: list[str]) -> str:
    numbered_claims = "\n".join(f"{i + 1}. {claim}" for i, claim in enumerate(claims))
    return (
        "You are evaluating whether an AI agent correctly perceived a piece of retrieved "
        "context. Below is the context it was given, followed by claims the agent made "
        "about that context.\n\n"
        f"Context:\n{context}\n\n"
        f"Claims:\n{numbered_claims}\n\n"
        "A claim is UNSUPPORTED if the context does not state it, or if it contradicts "
        "the context. General knowledge outside the context does NOT count as support "
        "here -- perception means correctly reading THIS context, nothing else.\n\n"
        "For EACH claim, respond on its own line in EXACTLY this format (no extra text):\n"
        "CLAIM <n>: SUPPORTED|UNSUPPORTED - <one sentence reason>"
    )


def detect_perception_hallucination(judge: Judge, context: str, claims: list[str]) -> PerceptionCritique:
    if not claims:
        return PerceptionCritique(claim_critiques=[])

    prompt = _build_prompt(context, claims)
    response = judge.complete(prompt)

    verdicts_by_claim_number: dict[int, tuple[bool, str]] = {}
    for line in response.splitlines():
        match = _CLAIM_LINE_PATTERN.search(line)
        if not match:
            continue
        claim_number = int(match.group(1))
        supported = match.group(2).upper() == "SUPPORTED"
        explanation = match.group(3).strip()
        verdicts_by_claim_number[claim_number] = (supported, explanation)

    critiques = []
    for index, claim in enumerate(claims):
        claim_number = index + 1
        if claim_number in verdicts_by_claim_number:
            supported, explanation = verdicts_by_claim_number[claim_number]
        else:
            supported, explanation = False, "Could not parse a judge verdict for this claim."
        critiques.append(ClaimCritique(claim=claim, supported=supported, explanation=explanation))

    return PerceptionCritique(claim_critiques=critiques)
