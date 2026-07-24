from unittest.mock import Mock, patch

from sentinel_engine.judge.ollama_judge import OllamaJudge


@patch("httpx.post")
def test_complete_posts_prompt_and_returns_response_text(mock_post):
    mock_post.return_value = Mock(
        json=lambda: {"response": "hello world"},
        raise_for_status=lambda: None,
    )
    judge = OllamaJudge(base_url="http://localhost:11434", model="llama3.2:3b")

    result = judge.complete("say hi")

    assert result == "hello world"
    mock_post.assert_called_once_with(
        "http://localhost:11434/api/generate",
        json={"model": "llama3.2:3b", "prompt": "say hi", "stream": False},
        timeout=60.0,
    )


@patch("httpx.post")
def test_complete_strips_trailing_slash_from_base_url(mock_post):
    mock_post.return_value = Mock(json=lambda: {"response": "x"}, raise_for_status=lambda: None)
    judge = OllamaJudge(base_url="http://localhost:11434/", model="llama3.2:3b")

    judge.complete("prompt")

    called_url = mock_post.call_args[0][0]
    assert called_url == "http://localhost:11434/api/generate"
