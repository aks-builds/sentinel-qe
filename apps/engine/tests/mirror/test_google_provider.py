from unittest.mock import Mock, patch

from sentinel_engine.mirror.providers.google_provider import GoogleProvider


@patch("httpx.post")
def test_complete_posts_generate_content_and_parses_response(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {
            "candidates": [{"content": {"parts": [{"text": "hello"}]}}],
            "usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 3},
        },
        raise_for_status=lambda: None,
    )
    provider = GoogleProvider(api_key="AIza-test", model="gemini-2.0-flash")

    result = provider.complete("say hi")

    assert result.text == "hello"
    assert result.input_tokens == 5
    assert result.output_tokens == 3
    mock_post.assert_called_once_with(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        params={"key": "AIza-test"},
        json={"contents": [{"role": "user", "parts": [{"text": "say hi"}]}]},
        timeout=60.0,
    )


@patch.dict("os.environ", {"GOOGLE_API_KEY": "AIza-env"})
@patch("httpx.post")
def test_falls_back_to_env_var_when_no_api_key_given(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {"candidates": [{"content": {"parts": [{"text": "x"}]}}], "usageMetadata": {}},
        raise_for_status=lambda: None,
    )
    provider = GoogleProvider()

    provider.complete("hi")

    assert mock_post.call_args[1]["params"]["key"] == "AIza-env"


@patch("httpx.post")
def test_defaults_to_gemini_2_0_flash_when_no_model_given(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {"candidates": [{"content": {"parts": [{"text": "x"}]}}], "usageMetadata": {}},
        raise_for_status=lambda: None,
    )
    provider = GoogleProvider(api_key="AIza-test")

    provider.complete("hi")

    called_url = mock_post.call_args[0][0]
    assert "gemini-2.0-flash" in called_url
