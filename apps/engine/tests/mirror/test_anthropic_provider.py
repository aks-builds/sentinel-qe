from unittest.mock import Mock, patch

from sentinel_engine.mirror.providers.anthropic_provider import AnthropicProvider


@patch("httpx.post")
def test_complete_posts_message_and_parses_response(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {
            "content": [{"type": "text", "text": "hello"}],
            "usage": {"input_tokens": 5, "output_tokens": 3},
        },
        raise_for_status=lambda: None,
    )
    provider = AnthropicProvider(api_key="sk-ant-test", model="claude-sonnet-5")

    result = provider.complete("say hi")

    assert result.text == "hello"
    assert result.input_tokens == 5
    assert result.output_tokens == 3
    mock_post.assert_called_once_with(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": "sk-ant-test",
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": "claude-sonnet-5",
            "max_tokens": 1024,
            "messages": [{"role": "user", "content": "say hi"}],
        },
        timeout=60.0,
    )


@patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-ant-env"})
@patch("httpx.post")
def test_falls_back_to_env_var_when_no_api_key_given(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {"content": [{"type": "text", "text": "x"}], "usage": {}},
        raise_for_status=lambda: None,
    )
    provider = AnthropicProvider()

    provider.complete("hi")

    assert mock_post.call_args[1]["headers"]["x-api-key"] == "sk-ant-env"


@patch("httpx.post")
def test_defaults_to_claude_sonnet_5_when_no_model_given(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {"content": [{"type": "text", "text": "x"}], "usage": {}},
        raise_for_status=lambda: None,
    )
    provider = AnthropicProvider(api_key="sk-ant-test")

    provider.complete("hi")

    assert mock_post.call_args[1]["json"]["model"] == "claude-sonnet-5"
