from unittest.mock import MagicMock, patch

import pytest

from sentinel_engine.playwright_service.browser import fetch_page_content


def _mock_playwright_context(mock_page: MagicMock) -> tuple[MagicMock, MagicMock]:
    mock_browser = MagicMock()
    mock_browser.new_page.return_value = mock_page

    mock_chromium = MagicMock()
    mock_chromium.launch.return_value = mock_browser

    mock_playwright_instance = MagicMock()
    mock_playwright_instance.chromium = mock_chromium
    return mock_playwright_instance, mock_browser


def test_fetch_page_content_navigates_and_extracts_title_and_text():
    mock_page = MagicMock()
    mock_page.title.return_value = "Example Title"
    mock_page.inner_text.return_value = "Example body text"
    mock_playwright_instance, mock_browser = _mock_playwright_context(mock_page)

    with patch("sentinel_engine.playwright_service.browser.sync_playwright") as mock_sync_playwright:
        mock_sync_playwright.return_value.__enter__.return_value = mock_playwright_instance

        result = fetch_page_content("https://example.com")

    mock_page.goto.assert_called_once_with("https://example.com")
    mock_page.inner_text.assert_called_once_with("body")
    mock_browser.close.assert_called_once()
    assert result.title == "Example Title"
    assert result.text == "Example body text"


def test_fetch_page_content_closes_browser_even_if_navigation_fails():
    mock_page = MagicMock()
    mock_page.goto.side_effect = RuntimeError("navigation failed")
    mock_playwright_instance, mock_browser = _mock_playwright_context(mock_page)

    with patch("sentinel_engine.playwright_service.browser.sync_playwright") as mock_sync_playwright:
        mock_sync_playwright.return_value.__enter__.return_value = mock_playwright_instance

        with pytest.raises(RuntimeError):
            fetch_page_content("https://example.com")

    mock_browser.close.assert_called_once()
