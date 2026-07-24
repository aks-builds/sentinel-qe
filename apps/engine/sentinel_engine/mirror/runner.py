from dataclasses import dataclass

from .providers.base import Provider


@dataclass
class PromptResult:
    prompt: str
    text: str
    input_tokens: int | None
    output_tokens: int | None


def run_prompt_suite(provider: Provider, prompts: list[str]) -> list[PromptResult]:
    results = []
    for prompt in prompts:
        response = provider.complete(prompt)
        results.append(
            PromptResult(
                prompt=prompt,
                text=response.text,
                input_tokens=response.input_tokens,
                output_tokens=response.output_tokens,
            )
        )
    return results
