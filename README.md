# Reaction and motor task analysis

Public test website: https://benson0875.github.io/reaction-motor-analysis-web/

The site contains only the analysis interface and synthetic examples. No participant records, age, results, original SD files or private firmware sources are bundled here. Imported files are processed locally in your browser; there is no upload endpoint or analytics.

Use desktop Chrome or Edge for optional Web Serial. Connect the device at its main menu and close Arduino Serial Monitor first. Requires firmware supporting usb-snapshot-v1. Initial device selection requires your permission. Opening a serial port may reset the device; connect before starting a test.

Features: USB snapshot import, read-only folder import and refresh, participant/session/task filters, pre/post paired descriptive analysis, individual trial RT and accuracy, wrist layouts, environmental snapshots, data-quality exclusions, CSV/JSON exports and Chinese/English interface.

This prototype reports task performance. It does not provide a validated health score, clinical diagnosis, or proof of exercise benefit. Hardware UI and complete browser/device transfer still require physical acceptance testing.

Close the page to clear its in-memory imported data. Export files if you need a durable local copy. The page requires explicit file or serial authorization and cannot silently read arbitrary folders.
