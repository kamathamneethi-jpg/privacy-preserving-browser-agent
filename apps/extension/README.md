# Chrome Extension — Privacy-Preserving Browser Agent

> 📌 **Mandatory Note for AI Agents**: Read [`../../AGENTS.md`](../../AGENTS.md) and [`../../to-do.md`](../../to-do.md) first before analyzing or modifying extension code.

This is a Chrome/Chromium Manifest V3 autonomous browser agent that perceives webpages, reasons over structural and visual layout, and executes multi-step web tasks while keeping 100% of sensitive information and secrets strictly on the user's local device.

---

## Key Features

1. **Autonomous Multi-Step Re-Act Execution Loop**:
   - Executes multi-step browser tasks (`MAX_STEPS = 6`) with DOM settlement pauses.
   - Dynamic element discovery assigning opaque references (`el_1`, `el_2`, ...) with spatial bounding boxes.
   - eCommerce facet filter, checkbox, price range, and organic product card recognition.
2. **Dual-Modality Agent Transmission**:
   - Generates on-device visual PII blackouts (redacted screenshot) combined with sanitized DOM trees (`el_1`, `el_2`, ...).
   - Transmits sanitized representation to multimodal models (e.g. `Qwen/Qwen3-VL-4B-Instruct`).
3. **CSP-Safe Local Action Runtime (`safeClick`)**:
   - Authoritative local DOM actions: `CLICK`, `TYPE`, `CLEAR`, `CHECK`, `UNCHECK`, `SELECT`, `PRESS_KEY`, `SUBMIT`, `SCROLL`, `NAVIGATE`.
   - Disarms `javascript:void(0)` and `javascript:` URLs during clicks so that Chrome Manifest V3 Content Security Policy never blocks interactions.
4. **On-Device PII Scanning & Redaction**:
   - Pattern-based and semantic detection of emails, phone numbers, credit cards (Luhn-verified), SSNs, and passwords.
   - In-memory Secure Privacy Vault for local form filling.
5. **Real-time Observability Backend Integration**:
   - Dispatches live telemetry events to the local server on `http://127.0.0.1:8765`.
   - Direct button in popup header to open the live visual dashboard.
6. **Native In-Popup Reloader**:
   - `🔄 Reload` button in header calling native `chrome.runtime.reload()` for 1-click extension reloading.

---

## Build & Installation

### 1. Build Extension Bundle
From the project root:
```bash
node scripts/build-extension.mjs
```
This bundles `@privacy-agent/privacy-core` into `apps/extension/dist/`.

### 2. Load into Chrome
1. Open Google Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (top-right switch).
3. Click **Load unpacked** and choose this `apps/extension` directory.
4. Open the extension popup from the toolbar.
5. After making code changes, simply click the **`🔄 Reload`** button in the popup header.

---

## File Structure

```text
apps/extension/
├── manifest.json         # Manifest V3 configuration (scripting, storage, all_urls)
├── popup.html            # User interface with settings, transmission card, and reload button
├── dist/                 # ESBuild bundled distribution files loaded by Chrome
└── src/
    ├── popup.js          # Re-Act loop, vision coordinator, model selector, reload listener
    ├── popup.css         # Extension UI styles
    ├── action-runtime.js # Authoritative DOM action executor with CSP-safe safeClick
    ├── content-pii.js    # On-device DOM PII scanner and highlighter
    ├── content-metadata.js # Safe page metadata extractor
    └── ocr-service.js    # On-device OCR adapter
```
