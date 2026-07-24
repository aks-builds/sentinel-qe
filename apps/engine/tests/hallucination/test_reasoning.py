from sentinel_engine.hallucination.reasoning import detect_reasoning_hallucination
from sentinel_engine.judge.base import Judge


class FakeJudge(Judge):
    def __init__(self, response: str):
        self.response = response
        self.last_prompt: str | None = None

    def complete(self, prompt: str) -> str:
        self.last_prompt = prompt
        return self.response


def test_all_steps_supported_reports_no_hallucination():
    judge = FakeJudge(
        "STEP 1: SUPPORTED - Directly stated in the input.\n"
        "STEP 2: SUPPORTED - Follows logically from step 1."
    )
    steps = ["The user asked for the account balance.", "The balance was retrieved via the get_balance tool."]

    critique = detect_reasoning_hallucination(judge, steps, conclusion="The balance is $500.")

    assert critique.hallucination_detected is False
    assert len(critique.step_critiques) == 2
    assert all(c.supported for c in critique.step_critiques)


def test_one_unsupported_step_flags_hallucination():
    judge = FakeJudge(
        "STEP 1: SUPPORTED - Directly stated in the input.\n"
        "STEP 2: UNSUPPORTED - No tool call justifies this claim."
    )
    steps = ["The user asked for the account balance.", "The balance is $1,000,000."]

    critique = detect_reasoning_hallucination(judge, steps, conclusion="The balance is $1,000,000.")

    assert critique.hallucination_detected is True
    assert critique.step_critiques[1].supported is False
    assert critique.step_critiques[1].explanation == "No tool call justifies this claim."


def test_missing_verdict_line_defaults_to_unsupported():
    judge = FakeJudge("STEP 1: SUPPORTED - ok")  # judge never produced a line for step 2
    steps = ["step one", "step two"]

    critique = detect_reasoning_hallucination(judge, steps, conclusion="c")

    assert critique.step_critiques[1].supported is False
    assert "could not parse" in critique.step_critiques[1].explanation.lower()


def test_empty_steps_returns_empty_critique_without_calling_the_judge():
    judge = FakeJudge("irrelevant")

    critique = detect_reasoning_hallucination(judge, [], conclusion="c")

    assert critique.step_critiques == []
    assert critique.hallucination_detected is False
    assert judge.last_prompt is None


def test_prompt_includes_all_steps_and_the_conclusion():
    judge = FakeJudge("STEP 1: SUPPORTED - ok")

    detect_reasoning_hallucination(judge, ["only step"], conclusion="final answer")

    assert "only step" in judge.last_prompt
    assert "final answer" in judge.last_prompt
