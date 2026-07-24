from sentinel_engine.hallucination.execution import ToolDefinition, detect_execution_hallucination
from sentinel_engine.judge.base import Judge


class FakeJudge(Judge):
    def __init__(self, response: str):
        self.response = response
        self.last_prompt: str | None = None

    def complete(self, prompt: str) -> str:
        self.last_prompt = prompt
        return self.response


TOOLS = [
    ToolDefinition(name="search_orders", description="Look up a customer's order history by order ID."),
    ToolDefinition(name="refund_order", description="Issue a refund for a given order ID."),
]


def test_correct_tool_and_valid_params_reports_no_hallucination():
    judge = FakeJudge("CORRECT_TOOL: search_orders\nREASON: The task only asks to look up an order.")

    critique = detect_execution_hallucination(
        judge,
        task="Look up order #12345",
        available_tools=TOOLS,
        selected_tool="search_orders",
        parameters_valid=True,
    )

    assert critique.hallucination_detected is False
    assert critique.tool_selection_correct is True
    assert critique.parameters_valid is True


def test_wrong_tool_selection_flags_hallucination():
    judge = FakeJudge("CORRECT_TOOL: search_orders\nREASON: A refund was not requested.")

    critique = detect_execution_hallucination(
        judge,
        task="Look up order #12345",
        available_tools=TOOLS,
        selected_tool="refund_order",
        parameters_valid=True,
    )

    assert critique.hallucination_detected is True
    assert critique.tool_selection_correct is False
    assert critique.correct_tool == "search_orders"


def test_invalid_parameters_flag_hallucination_even_with_correct_tool_selection():
    judge = FakeJudge("CORRECT_TOOL: search_orders\nREASON: Correct tool for the task.")

    critique = detect_execution_hallucination(
        judge,
        task="Look up order #12345",
        available_tools=TOOLS,
        selected_tool="search_orders",
        parameters_valid=False,
        parameter_errors=["root.order_id: required property missing"],
    )

    assert critique.hallucination_detected is True
    assert critique.tool_selection_correct is True
    assert critique.parameters_valid is False
    assert critique.parameter_errors == ["root.order_id: required property missing"]


def test_unparseable_judge_response_defaults_to_incorrect():
    judge = FakeJudge("I'm not sure.")

    critique = detect_execution_hallucination(
        judge, task="t", available_tools=TOOLS, selected_tool="search_orders", parameters_valid=True
    )

    assert critique.tool_selection_correct is False
    assert "could not parse" in critique.reason.lower()


def test_prompt_includes_task_tools_and_selected_tool():
    judge = FakeJudge("CORRECT_TOOL: search_orders\nREASON: ok")

    detect_execution_hallucination(
        judge,
        task="a unique task description",
        available_tools=TOOLS,
        selected_tool="search_orders",
        parameters_valid=True,
    )

    assert "a unique task description" in judge.last_prompt
    assert "search_orders" in judge.last_prompt
    assert "refund_order" in judge.last_prompt
