from unittest.mock import Mock, patch

from sentinel_engine.mirror.providers.grok_provider import GrokProvider


@patch("httpx.post")
def test_complete_posts_to_the_xai_endpoint_and_parses_response(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {
            "choices": [{"message": {"content": "hello"}}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 3},
        },
        raise_for_status=lambda: None,
    )
    provider = GrokProvider(api_key="xai-test", model="grok-2-latest")

    result = provider.complete("say hi")

    assert result.text == "hello"
    assert result.input_tokens == 5
    assert result.output_tokens == 3
    mock_post.assert_called_once_with(
        "https://api.x.ai/v1/chat/completions",
        headers={"Authorization": "Bearer xai-test"},
        json={"model": "grok-2-latest", "messages": [{"role": "user", "content": "say hi"}]},
        timeout=60.0,
    )


@patch.dict("os.environ", {"GROK_API_KEY": "xai-env"})
@patch("httpx.post")
def test_falls_back_to_env_var_when_no_api_key_given(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {"choices": [{"message": {"content": "x"}}], "usage": {}},
        raise_for_status=lambda: None,
    )
    provider = GrokProvider()

    provider.complete("hi")

    assert mock_post.call_args[1]["headers"]["Authorization"] == "Bearer xai-env"


@patch("httpx.post")
def test_defaults_to_grok_2_latest_when_no_model_given(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {"choices": [{"message": {"content": "x"}}], "usage": {}},
        raise_for_status=lambda: None,
    )
    provider = GrokProvider(api_key="xai-test")

    provider.complete("hi")

    assert mock_post.call_args[1]["json"]["model"] == "grok-2-latest"
