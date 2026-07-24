import re
from dataclasses import dataclass, field

from sentinel_engine.judge.base import Judge

_CORRECT_TOOL_PATTERN = re.compile(r"CORRECT_TOOL:\s*(.+)", re.IGNORECASE)
_REASON_PATTERN = re.compile(r"REASON:\s*(.+)", re.IGNORECASE)


@dataclass
class ToolDefinition:
    name: str
    description: str


@dataclass
class ExecutionCritique:
    correct_tool: str
    tool_selection_correct: bool
    reason: str
    parameters_valid: bool
    parameter_errors: list[str] = field(default_factory=list)

    @property
    def hallucination_detected(self) -> bool:
        return not self.tool_selection_correct or not self.parameters_valid


def _build_prompt(task: str, available_tools: list[ToolDefinition], selected_tool: str) -> str:
    tool_list = "\n".join(f"- {tool.name}: {tool.description}" for tool in available_tools)
    return (
        "You are evaluating whether an AI agent selected the correct tool for its task.\n\n"
        f"Task: {task}\n\n"
        f"Available tools:\n{tool_list}\n\n"
        f"The agent selected: {selected_tool}\n\n"
        "Respond in EXACTLY this format (no extra text):\n"
        "CORRECT_TOOL: <name of the tool that should have been used, or NONE if no tool call was needed>\n"
        "REASON: <one sentence>"
    )


def detect_execution_hallucination(
    judge: Judge,
    task: str,
    available_tools: list[ToolDefinition],
    selected_tool: str,
    parameters_valid: bool,
    parameter_errors: list[str] | None = None,
) -> ExecutionCritique:
    parameter_errors = parameter_errors or []
    prompt = _build_prompt(task, available_tools, selected_tool)
    response = judge.complete(prompt)

    correct_tool_match = _CORRECT_TOOL_PATTERN.search(response)
    if correct_tool_match:
        correct_tool = correct_tool_match.group(1).strip()
        tool_selection_correct = correct_tool.lower() == selected_tool.strip().lower()
        reason_match = _REASON_PATTERN.search(response)
        reason = reason_match.group(1).strip() if reason_match else ""
    else:
        correct_tool = ""
        tool_selection_correct = False
        reason = "Could not parse a judge verdict for tool selection."

    return ExecutionCritique(
        correct_tool=correct_tool,
        tool_selection_correct=tool_selection_correct,
        reason=reason,
        parameters_valid=parameters_valid,
        parameter_errors=parameter_errors,
    )
