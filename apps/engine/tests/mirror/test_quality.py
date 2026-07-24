from sentinel_engine.mirror.quality import score_quality
from sentinel_engine.judge.base import Judge


class FakeJudge(Judge):
    def __init__(self, response: str):
        self.response = response
        self.last_prompt: str | None = None

    def complete(self, prompt: str) -> str:
        self.last_prompt = prompt
        return self.response


def test_parses_all_three_scores_and_reason():
    judge = FakeJudge("CORRECTNESS: 4\nRELEVANCE: 5\nTONE: 3\nREASON: Accurate but slightly terse.")

    result = score_quality(judge, prompt="What is 2+2?", response="4")

    assert result.correctness == 4
    assert result.relevance == 5
    assert result.tone == 3
    assert result.reason == "Accurate but slightly terse."


def test_missing_dimension_defaults_to_none():
    judge = FakeJudge("CORRECTNESS: 4\nRELEVANCE: 5\nREASON: ok")  # no TONE line

    result = score_quality(judge, prompt="p", response="r")

    assert result.correctness == 4
    assert result.relevance == 5
    assert result.tone is None


def test_completely_unparseable_response_returns_all_none_with_a_clear_reason():
    judge = FakeJudge("I cannot evaluate this.")

    result = score_quality(judge, prompt="p", response="r")

    assert result.correctness is None
    assert result.relevance is None
    assert result.tone is None
    assert "could not parse" in result.reason.lower()


def test_prompt_includes_the_prompt_and_response():
    judge = FakeJudge("CORRECTNESS: 3\nRELEVANCE: 3\nTONE: 3\nREASON: ok")

    score_quality(judge, prompt="a unique prompt", response="a unique response")

    assert "a unique prompt" in judge.last_prompt
    assert "a unique response" in judge.last_prompt


def test_prompt_includes_expected_answer_when_given():
    judge = FakeJudge("CORRECTNESS: 3\nRELEVANCE: 3\nTONE: 3\nREASON: ok")

    score_quality(judge, prompt="p", response="r", expected_answer="a unique expected answer")

    assert "a unique expected answer" in judge.last_prompt


def test_prompt_omits_expected_answer_section_when_not_given():
    judge = FakeJudge("CORRECTNESS: 3\nRELEVANCE: 3\nTONE: 3\nREASON: ok")

    score_quality(judge, prompt="p", response="r")

    assert "Expected/reference answer" not in judge.last_prompt
