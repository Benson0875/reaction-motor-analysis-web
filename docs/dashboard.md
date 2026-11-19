# Dashboard appearance and navigation

The application adds a light/dark switch, desktop sidebar, mobile menu, task tabs, selection summary, collapsible session navigation and detailed tables. The theme uses a dedicated browser preference, gracefully handles unavailable storage, and does not reimport data or reload the local model. SVG colors and print styling use semantic tokens. Print uses a light palette.

Local calculations, pairing, quality gates, source handling, USB and environmental parsing are unchanged. Descriptive data remains separate from strict comparisons. Raw records remain local, and removal still affects only the current browser snapshot.

Validation: desktop Chromium and 1024/768/390px layouts; theme reload/storage failure; retained record and assistant conversation on theme switch; task filters; quality navigation/return; Escape; reduced motion; print; existing copied-SD, CSV, cancellation/removal, USB simulation and assistant regressions. The unchanged calculation/parsing modules were hash-checked. Declared normal text token contrast pairs exceed 4.5:1; this is not a whole-page accessibility certification.

Physical USB/SD, actual GPU inference, human usability, 200% browser zoom and CLS/FPS remain unverified. The earlier WebLLM inference limitations still apply.

Rebuild static HTML with `python3 tools/build-site.py`; the previously committed WebLLM Worker and dependency lock remain unchanged. No new package or framework migration is needed.
