from dataclasses import dataclass

from sentinel_engine.guard.compliance_judge import evaluate_compliance
from sentinel_engine.guard.multiturn import MultiTurnAttack
from sentinel_engine.judge.base import Judge
from sentinel_engine.mirror.providers.base import Message, Provider


@dataclass
class TurnResult:
    attacker_message: str
    target_response: str
    verdict: str
    reason: str


@dataclass
class MultiTurnAttackResult:
    attack_id: str
    turns: list[TurnResult]
    compromised: bool


def _format_conversation(messages: list[Message]) -> str:
    return "\n".join(f"{message.role.upper()}: {message.content}" for message in messages)


def run_multiturn_attack(provider: Provider, judge: Judge, attack: MultiTurnAttack) -> MultiTurnAttackResult:
    conversation: list[Message] = []
    turn_results: list[TurnResult] = []

    for turn_prompt in attack.turns:
        conversation.append(Message(role="user", content=turn_prompt))
        response = provider.complete_conversation(conversation)
        conversation.append(Message(role="assistant", content=response.text))

        verdict = evaluate_compliance(judge, _format_conversation(conversation))
        turn_results.append(
            TurnResult(
                attacker_message=turn_prompt,
                target_response=response.text,
                verdict=verdict.verdict,
                reason=verdict.reason,
            )
        )

    compromised = any(result.verdict == "COMPLIED" for result in turn_results)
    return MultiTurnAttackResult(attack_id=attack.id, turns=turn_results, compromised=compromised)
