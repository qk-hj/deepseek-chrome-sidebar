# Testing

Use Node.js 24+ and run `npm ci` from the repository root.

- `npm test`: document tools, reusable full-reading notes (follow-up/reopened-panel reuse, text/model invalidation, cost confirmation, failed-batch resume, storage-failure fallback), linked-tab events, search parsing/source limits, and package audit. No browser or real API key needed.
- `npx playwright install chromium`, then `npm run test:ui`: real headless browser with mocked Chrome extension APIs and mocked DeepSeek responses. Covers selection, layout, model discovery, search success/failure, thinking-mode tool choice and stored sources.
- `npm run test:pdf -- "paper.pdf" "guide.pdf"`: real PDF.js parsing with mocked API replies. Requires the exact 18-page SeqAcademy 2020 v4 paper; optionally the 456-page English Erasmus+ Programme Guide 2026. The fixtures are not bundled. The assertions deliberately refer to these documents, not arbitrary PDFs.
- `npm run icons`: regenerate the raster icons from the checked-in original SVG. Requires the development canvas package.
- `npm run test:extension`: actual unpacked extension APIs/storage/CSP and confirmation in the native Chrome side panel, using a temporary profile. Requires Chrome supporting CDP `Extensions.loadUnpacked`; not part of CI. No real API calls.
- The hardening browser suite covers thinking + search/PDF follow-up/history restoration, cancel-to-on-demand, stopped reading with retained draft, output truncation, persistent save failure, editable selection protection and placeholder collisions. PDF fixture tests also abort a real PDF.js parse and PDF download.

Set `CHROME_PATH` to use an existing Chrome executable. Without it, tests use the Playwright-installed Chromium. Tests create fresh browser contexts and never connect to your personal browser profile. Test screenshots are ignored by Git; README screenshots are copied separately after visual review.

The CI runs unit/audit checks and the mocked browser suite. The PDF fixture suite is optional and does not run in CI; tests are not proof of universal compatibility with live DeepSeek models or all PDF documents.

For this public preview, the original local environment passed real 18-page and 456-page PDF parsing, page-400 retrieval, all-page batching, linked-tab/history tests, and mocked search/model tests. A user separately reported successful live search; no real Key or user browsing data is included as a test fixture.
