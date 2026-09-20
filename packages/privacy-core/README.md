# Privacy Core — On-Device Perception, Policy & Security Engine

> 📌 **Mandatory Note for AI Agents**: Read [`../../AGENTS.md`](../../AGENTS.md) and [`../../to-do.md`](../../to-do.md) first before modifying core privacy or perception modules.

`@privacy-agent/privacy-core` is the foundational on-device privacy, perception, and browser automation library for the Privacy-Preserving Browser Agent.

---

## Key Modules

### 1. Multimodal Vision Agent (`src/multimodal-vision-agent.js`)
- Coordinates dual-modality agent ingestion.
- Takes on-device screenshots and blackouts detected sensitive PII bounding boxes.
- Packages the redacted screenshot alongside the sanitized structural DOM tree.
- Dispatches payloads to visual models (e.g. `Qwen/Qwen3-VL-4B-Instruct` via free Hugging Face token) or the local heuristic planner.

### 2. Interactive Element Registry (`src/interactive-element-registry.js`)
- Performs dynamic DOM perception across any webpage.
- Assigns opaque element IDs (`el_1`, `el_2`, ...) and spatial bounding boxes.
- Detects filter facets, checkboxes, price inputs, sponsored ad containers, and organic search results.

### 3. CSP-Safe DOM Driver (`src/dom-driver.js`)
- Executes browser actions: `CLICK`, `TYPE`, `CLEAR`, `SELECT`, `CHECK`, `UNCHECK`, `PRESS_KEY`, `SUBMIT`, `SCROLL`.
- Implements `safeClickElement` to neutralize `javascript:void(0)` anchor navigations, preventing Chrome MV3 CSP errors.

### 4. Secure Communication Client (`src/secure-communication-client.js`)
- Enforces a zero-leakage network boundary.
- Performs pre-serialization validation to ensure raw secrets, unsanitized DOM nodes, and raw screenshots never cross to remote models.

### 5. Privacy Policy Engine (`src/policy-engine.js`)
- Evaluates policy decisions: `ALLOW`, `REDACT`, `TOKENIZE`, `LOCAL_ONLY`.
- Precedence hierarchy guarantees sensitive secrets default to `REDACT` or `LOCAL_ONLY`.

### 6. Secure Local Privacy Vault (`src/privacy-vault.js`)
- In-memory temporary isolated vault for credentials (passwords, payment cards, OTPs).
- TTL expiration and purpose isolation. Strictly blocked from remote transport.

### 7. Hardware Acceleration (`src/webgpu-manager.js` & `src/visual-model-adapter.js`)
- Manages WebGPU hardware acceleration for on-device ONNX Runtime Web inference, with graceful WASM/CPU fallback.

---

## Automated Tests

Run unit and integration test suites:
```bash
node --test tests/generic-dom-actions.test.mjs tests/content-pii-scan.test.mjs tests/groq-model-provider.test.mjs
```
All 309+ privacy and DOM action test cases pass.
