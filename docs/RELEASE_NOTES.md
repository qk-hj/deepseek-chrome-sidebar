## DeepSeek Sidebar 0.8.3 — Reading and reliability fixes

Unofficial Chrome extension for chatting with selected text, the current webpage, and text-based PDFs using your own DeepSeek API Key.

### Included

- Automatic text selection, compact preview and current-page context.
- Linked-tab conversation continuity and local conversation history.
- Long-PDF indexing, relevant-page retrieval and explicit full-reading mode.
- Automatic model discovery and light/dark UI.
- Experimental official web search, thinking-mode compatibility, and up to five deduplicated source links.
- Reusable PDF notes, in-panel cost confirmation, bounded split retries and reading budgets.
- Stop during reading/parsing, accurate source coverage and incomplete-answer warnings.
- Persisted assistant/tool subturns, editor privacy guards and visible history-save failures.

### Install

Download and extract `DeepSeek-Chrome-Sidebar-v0.8.3.zip`. Open `chrome://extensions/`, turn on **Developer mode**, click **Load unpacked**, and select the extracted `DeepSeek-Chrome-Sidebar` folder.

Existing users: replace files in the original loaded folder and click **Reload**. Do not uninstall if you want to preserve access to local history/settings.

### Important

Your own DeepSeek API Key is required. Model requests, web search and batch PDF reading incur API usage. Extracted page/document text is sent to DeepSeek when asking a question; local PDF parsing is not end-to-end offline processing.

Web search has a user-reported live success, but remains experimental across accounts/models. No OCR, automatic webpage control or multi-provider support. Browser-native PDF selection is not automatically captured. Read README.md, PRIVACY.md and the third-party notices before use.

This is a personal project, not an official DeepSeek product or a Chrome Web Store listing.
