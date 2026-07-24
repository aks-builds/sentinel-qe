from sentinel_engine.hallucination.communication import detect_communication_hallucination
from sentinel_engine.judge.base import Judge


class FakeJudge(Judge):
    def __init__(self, response: str):
        self.response = response
        self.last_prompt: str | None = None

    def complete(self, prompt: str) -> str:
        self.last_prompt = prompt
        return self.response


def test_faithful_message_reports_no_hallucination():
    judge = FakeJudge("VERDICT: FAITHFUL\nREASON: The message matches the internal facts exactly.")
    facts = ["The order total is $42.50.", "The order shipped on 2026-07-03."]

    critique = detect_communication_hallucination(
        judge, facts, final_message="Your order totals $42.50 and shipped on 2026-07-03."
    )

    assert critique.hallucination_detected is False
    assert critique.faithful is True


def test_unfaithful_message_flags_hallucination():
    judge = FakeJudge("VERDICT: UNFAITHFUL\nREASON: The message claims a refund that was never processed.")
    facts = ["The order total is $42.50.", "No refund has been issued."]

    critique = detect_communication_hallucination(
        judge, facts, final_message="Your order totals $42.50 and has been fully refunded."
    )

    assert critique.hallucination_detected is True
    assert critique.faithful is False
    assert critique.reason == "The message claims a refund that was never processed."


def test_unparseable_judge_response_defaults_to_unfaithful():
    judge = FakeJudge("Not sure how to evaluate this.")

    critique = detect_communication_hallucination(judge, ["a fact"], final_message="a message")

    assert critique.faithful is False
    assert "could not parse" in critique.reason.lower()


def test_prompt_includes_facts_and_final_message():
    judge = FakeJudge("VERDICT: FAITHFUL\nREASON: ok")

    detect_communication_hallucination(judge, ["a unique fact"], final_message="a unique final message")

    assert "a unique fact" in judge.last_prompt
    assert "a unique final message" in judge.last_prompt
