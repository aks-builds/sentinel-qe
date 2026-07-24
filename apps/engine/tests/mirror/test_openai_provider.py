from unittest.mock import Mock, patch

from sentinel_engine.mirror.providers.openai_provider import OpenAIProvider


@patch("httpx.post")
def test_complete_posts_chat_completion_and_parses_response(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {
            "choices": [{"message": {"content": "hello"}}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 3},
        },
        raise_for_status=lambda: None,
    )
    provider = OpenAIProvider(api_key="sk-test", model="gpt-4o-mini")

    result = provider.complete("say hi")

    assert result.text == "hello"
    assert result.input_tokens == 5
    assert result.output_tokens == 3
    mock_post.assert_called_once_with(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": "Bearer sk-test"},
        json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "say hi"}]},
        timeout=60.0,
    )


@patch.dict("os.environ", {"OPENAI_API_KEY": "sk-env"})
@patch("httpx.post")
def test_falls_back_to_env_var_when_no_api_key_given(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {"choices": [{"message": {"content": "x"}}], "usage": {}},
        raise_for_status=lambda: None,
    )
    provider = OpenAIProvider()

    provider.complete("hi")

    assert mock_post.call_args[1]["headers"]["Authorization"] == "Bearer sk-env"


@patch("httpx.post")
def test_defaults_to_gpt_4o_mini_when_no_model_given(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {"choices": [{"message": {"content": "x"}}], "usage": {}},
        raise_for_status=lambda: None,
    )
    provider = OpenAIProvider(api_key="sk-test")

    provider.complete("hi")

    assert mock_post.call_args[1]["json"]["model"] == "gpt-4o-mini"
