from unittest.mock import MagicMock, patch

from sentinel_engine.playwright_service.conversation import (
    ConversationSession,
    chatgpt_session,
    claude_session,
)


def _mock_playwright():
    mock_page = MagicMock()
    mock_browser = MagicMock()
    mock_browser.new_page.return_value = mock_page
    mock_chromium = MagicMock()
    mock_chromium.launch.return_value = mock_browser
    mock_playwright_instance = MagicMock()
    mock_playwright_instance.chromium = mock_chromium
    mock_playwright_factory = MagicMock()
    mock_playwright_factory.start.return_value = mock_playwright_instance
    return mock_playwright_factory, mock_playwright_instance, mock_browser, mock_page


def test_enter_navigates_to_the_given_url():
    mock_factory, _, _, mock_page = _mock_playwright()

    with patch(
        "sentinel_engine.playwright_service.conversation.sync_playwright",
        return_value=mock_factory,
    ):
        with ConversationSession(
            url="file:///fixture.html",
            input_selector="#in",
            send_selector="#send",
            response_selector=".resp",
        ):
            pass

    mock_page.goto.assert_called_once_with("file:///fixture.html")


def test_send_message_fills_clicks_and_extracts_the_correctly_numbered_turn():
    mock_factory, _, _, mock_page = _mock_playwright()
    mock_page.inner_text.return_value = "Hello there"

    with patch(
        "sentinel_engine.playwright_service.conversation.sync_playwright",
        return_value=mock_factory,
    ):
        with ConversationSession(
            url="file:///fixture.html",
            input_selector="#in",
            send_selector="#send",
            response_selector=".resp",
        ) as session:
            result = session.send_message("Hi")

    mock_page.fill.assert_called_once_with("#in", "Hi")
    mock_page.click.assert_called_once_with("#send")
    mock_page.wait_for_selector.assert_called_once_with(".resp[data-turn='1']")
    mock_page.inner_text.assert_called_once_with(".resp[data-turn='1']")
    assert result == "Hello there"


def test_send_message_increments_the_turn_counter_across_calls():
    mock_factory, _, _, mock_page = _mock_playwright()

    with patch(
        "sentinel_engine.playwright_service.conversation.sync_playwright",
        return_value=mock_factory,
    ):
        with ConversationSession(
            url="file:///fixture.html",
            input_selector="#in",
            send_selector="#send",
            response_selector=".resp",
        ) as session:
            session.send_message("first")
            session.send_message("second")

    assert mock_page.wait_for_selector.call_args_list[0].args[0] == ".resp[data-turn='1']"
    assert mock_page.wait_for_selector.call_args_list[1].args[0] == ".resp[data-turn='2']"


def test_exit_closes_the_browser_and_stops_playwright():
    mock_factory, mock_instance, mock_browser, _ = _mock_playwright()

    with patch(
        "sentinel_engine.playwright_service.conversation.sync_playwright",
        return_value=mock_factory,
    ):
        with ConversationSession(
            url="file:///fixture.html",
            input_selector="#in",
            send_selector="#send",
            response_selector=".resp",
        ):
            pass

    mock_browser.close.assert_called_once()
    mock_instance.stop.assert_called_once()


def test_chatgpt_session_uses_chatgpt_style_selectors():
    session = chatgpt_session("file:///chatgpt_fixture.html")
    assert session.input_selector == "#prompt-input"
    assert session.send_selector == "#send-button"
    assert session.response_selector == ".response-bubble"


def test_claude_session_uses_claude_style_selectors():
    session = claude_session("file:///claude_fixture.html")
    assert session.input_selector == "#composer-input"
    assert session.send_selector == "#submit-button"
    assert session.response_selector == ".assistant-message"
