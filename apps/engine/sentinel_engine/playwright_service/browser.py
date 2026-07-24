from dataclasses import dataclass

from playwright.sync_api import sync_playwright


@dataclass
class PageContent:
    title: str
    text: str


def fetch_page_content(url: str) -> PageContent:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            page = browser.new_page()
            page.goto(url)
            return PageContent(title=page.title(), text=page.inner_text("body"))
        finally:
            browser.close()
