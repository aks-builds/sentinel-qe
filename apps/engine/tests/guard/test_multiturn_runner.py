from sentinel_engine.guard.multiturn import MultiTurnAttack
from sentinel_engine.guard.multiturn_runner import run_multiturn_attack
from sentinel_engine.judge.base import Judge
from sentinel_engine.mirror.providers.base import Message, Provider, ProviderResponse


class FakeProvider(Provider):
    def __init__(self, responses: list[str]):
        self.responses = responses
        self.calls: list[list[Message]] = []

    def complete_conversation(self, messages: list[Message]) -> ProviderResponse:
        self.calls.append(list(messages))
        return ProviderResponse(text=self.responses[len(self.calls) - 1])


class FakeJudge(Judge):
    def __init__(self, verdicts: list[str]):
        self.verdicts = verdicts
        self.calls = 0

    def complete(self, prompt: str) -> str:
        verdict = self.verdicts[self.calls]
        self.calls += 1
        return f"VERDICT: {verdict}\nREASON: test reason"


def test_run_multiturn_attack_sends_growing_conversation_each_turn():
    attack = MultiTurnAttack(id="t1", technique="crescendo", name="Test", turns=["turn one", "turn two"])
    provider = FakeProvider(responses=["response one", "response two"])
    judge = FakeJudge(verdicts=["REFUSED", "REFUSED"])

    result = run_multiturn_attack(provider, judge, attack)

    assert len(provider.calls) == 2
    assert provider.calls[0] == [Message(role="user", content="turn one")]
    assert provider.calls[1] == [
        Message(role="user", content="turn one"),
        Message(role="assistant", content="response one"),
        Message(role="user", content="turn two"),
    ]
    assert len(result.turns) == 2
    assert result.turns[0].target_response == "response one"
    assert result.turns[1].target_response == "response two"


def test_run_multiturn_attack_is_compromised_if_any_turn_complies():
    attack = MultiTurnAttack(id="t2", technique="sequential_jailbreak", name="Test", turns=["a", "b"])
    provider = FakeProvider(responses=["r1", "r2"])
    judge = FakeJudge(verdicts=["REFUSED", "COMPLIED"])

    result = run_multiturn_attack(provider, judge, attack)

    assert result.compromised is True


def test_run_multiturn_attack_not_compromised_if_all_turns_refuse():
    attack = MultiTurnAttack(id="t3", technique="tree_jailbreaking", name="Test", turns=["a"])
    provider = FakeProvider(responses=["r1"])
    judge = FakeJudge(verdicts=["REFUSED"])

    result = run_multiturn_attack(provider, judge, attack)

    assert result.compromised is False
