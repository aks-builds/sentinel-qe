from sentinel_engine.hallucination.perception import detect_perception_hallucination
from sentinel_engine.judge.base import Judge


class FakeJudge(Judge):
    def __init__(self, response: str):
        self.response = response
        self.last_prompt: str | None = None

    def complete(self, prompt: str) -> str:
        self.last_prompt = prompt
        return self.response


CONTEXT = "The order was placed on 2026-07-01 and shipped on 2026-07-03. Status: delivered."


def test_all_claims_supported_reports_no_hallucination():
    judge = FakeJudge(
        "CLAIM 1: SUPPORTED - The context states the order shipped on 2026-07-03.\n"
        "CLAIM 2: SUPPORTED - The context states the status is delivered."
    )
    claims = ["The order shipped on 2026-07-03.", "The order has been delivered."]

    critique = detect_perception_hallucination(judge, CONTEXT, claims)

    assert critique.hallucination_detected is False
    assert len(critique.claim_critiques) == 2


def test_unsupported_claim_flags_hallucination():
    judge = FakeJudge(
        "CLAIM 1: SUPPORTED - Matches the context.\n"
        "CLAIM 2: UNSUPPORTED - The context never mentions a refund."
    )
    claims = ["The order shipped on 2026-07-03.", "The order was refunded."]

    critique = detect_perception_hallucination(judge, CONTEXT, claims)

    assert critique.hallucination_detected is True
    assert critique.claim_critiques[1].supported is False
    assert critique.claim_critiques[1].explanation == "The context never mentions a refund."


def test_missing_verdict_line_defaults_to_unsupported():
    judge = FakeJudge("CLAIM 1: SUPPORTED - ok")  # no line for claim 2
    claims = ["claim one", "claim two"]

    critique = detect_perception_hallucination(judge, CONTEXT, claims)

    assert critique.claim_critiques[1].supported is False
    assert "could not parse" in critique.claim_critiques[1].explanation.lower()


def test_empty_claims_returns_empty_critique_without_calling_the_judge():
    judge = FakeJudge("irrelevant")

    critique = detect_perception_hallucination(judge, CONTEXT, [])

    assert critique.claim_critiques == []
    assert critique.hallucination_detected is False
    assert judge.last_prompt is None


def test_prompt_includes_context_and_claims_and_excludes_general_knowledge():
    judge = FakeJudge("CLAIM 1: SUPPORTED - ok")

    detect_perception_hallucination(judge, CONTEXT, ["a specific claim"])

    assert CONTEXT in judge.last_prompt
    assert "a specific claim" in judge.last_prompt
    assert "general knowledge" in judge.last_prompt.lower()
