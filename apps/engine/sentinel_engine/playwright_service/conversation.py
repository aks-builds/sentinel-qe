from playwright.sync_api import sync_playwright


class ConversationSession:
    def __init__(self, url: str, input_selector: str, send_selector: str, response_selector: str):
        self.url = url
        self.input_selector = input_selector
        self.send_selector = send_selector
        self.response_selector = response_selector
        self._turn = 0
        self._playwright = None
        self._browser = None
        self._page = None

    def __enter__(self) -> "ConversationSession":
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch()
        self._page = self._browser.new_page()
        self._page.goto(self.url)
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self._browser.close()
        self._playwright.stop()

    def send_message(self, text: str) -> str:
        self._turn += 1
        self._page.fill(self.input_selector, text)
        self._page.click(self.send_selector)
        turn_selector = f"{self.response_selector}[data-turn='{self._turn}']"
        self._page.wait_for_selector(turn_selector)
        return self._page.inner_text(turn_selector)


def chatgpt_session(url: str) -> ConversationSession:
    return ConversationSession(
        url=url,
        input_selector="#prompt-input",
        send_selector="#send-button",
        response_selector=".response-bubble",
    )


def claude_session(url: str) -> ConversationSession:
    return ConversationSession(
        url=url,
        input_selector="#composer-input",
        send_selector="#submit-button",
        response_selector=".assistant-message",
    )
