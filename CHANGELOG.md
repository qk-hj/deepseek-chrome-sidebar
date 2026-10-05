# Changelog

## 0.8.3 — Reading and reliability fixes

- Reusable PDF notes, interrupted-batch recovery, in-panel cost confirmation and cancel-to-on-demand fallback.
- Truncated notes split once and retry with bounded requests; tool material has a character budget.
- Persist actual assistant/tool subturns and reasoning; old display history remains readable.
- Stop webpage reads, PDF downloads/parsing, batch reading and answer generation; preserve unsent drafts on navigation.
- Shared editor-selection protection; editable text excluded from webpage context; confirm cross-origin embedded PDFs.
- Explicit source coverage, incomplete-answer notices and persistent history-save warnings.
- Temporary selection/tab cleanup, menu registration, keyboard gesture handling and Markdown placeholder fixes.
- Expanded mocked regression tests and real Chrome extension/native-panel dialog checks; no live API verification claimed.

## 0.8.2 — Initial public preview

- Chrome side panel for current-page and selected-text questions.
- Linked-tab conversation continuity, local searchable history, and empty-chat filtering.
- Full local PDF indexing, on-demand retrieval, and explicit batch full-reading mode.
- Minimal blue D branding, compact selection preview, light/dark layouts.
- Automatic model discovery, caching, and explicit fallback status.
- Experimental official web search with source links and thinking-mode compatibility.
- Source list deduplication and a maximum of five displayed references.
- Publication documentation, privacy/permission explanation, original-code MIT license, and test tooling.

The previous 0.8.2 archives remain old snapshots. Use the 0.8.3 package for these fixes; existing settings and display history are retained.
