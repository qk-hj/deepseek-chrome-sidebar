# Third-party notices

The root MIT license applies only to original project code and documentation, not to third-party assets or trademarks.

The extension bundles PDF.js (`pdfjs-dist` 6.3.289) from Mozilla, under Apache-2.0. Preserve `vendor/LICENSE`, `vendor/NOTICE.md`, and the upstream JavaScript copyright headers.

Additional assets retain separate terms:

- Adobe CMaps: `vendor/cmaps/LICENSE`.
- Foxit/PDFium fonts: `vendor/standard_fonts/LICENSE_FOXIT`.
- Liberation fonts: `vendor/standard_fonts/LICENSE_LIBERATION` (GPL v2 with the listed exceptions). Do not relabel these font files as MIT.

All paths above are relative to `DeepSeek-Chrome-Sidebar/`. Redistribution must retain the applicable notices and comply with their terms; the presence of a notice is not a substitute for checking the upstream requirements.

Development-only dependencies are installed by npm, not shipped inside the extension: Playwright and @napi-rs/canvas. Their own package licenses apply.

The blue D icon is original SVG geometry, not DeepSeek's official whale mark. DeepSeek's name and marks belong to their respective owners. This project is not affiliated with or endorsed by DeepSeek.
