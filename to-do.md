# TODO

## Current Focus

**Package the `@privacy-agent/privacy-core` library into the Chrome Extension runtime**: Configure a bundler (such as Rollup, esbuild, or Vite) to compile the ES module core packages into browser-compatible distribution scripts for [`apps/extension`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/apps/extension), replacing temporary runtime mirror scripts.

---

## Critical Path

1. **Root Module Type & Typeless Warning Resolution**: Add `"type": "module"` to root [`package.json`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/package.json) and package workspaces.
2. **Chrome Extension Bundling**: Create an automated build script to bundle `@privacy-agent/privacy-core` directly into [`apps/extension`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/apps/extension).
3. **Real Remote LLM Provider Connector**: Implement live AI reasoning adapters (OpenAI, Anthropic, Gemini, or local Ollama) in [`services/reasoning-backend`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/services/reasoning-backend).
4. **On-Device OCR & Model Binary Integration**: Bundle physical OCR / visual model assets into the Chrome extension package.
5. **Extension Popup Full Task Automation UI**: Wire `BrowserAgentCoordinator` into [`apps/extension/src/popup.js`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/apps/extension/src/popup.js).

---

## P0 — Critical

*None currently blocking core execution. (All 17 verification scripts and 298 automated unit tests are passing).*

[x] Add `"type": "module"` declaration to root `package.json`
* **Completed**: Added `"type": "module"` to root `package.json`. Node module typeless warnings eliminated.

---

## P1 — High Priority

[x] Configure Extension Build Bundler for `@privacy-agent/privacy-core`
* **Completed**: Configured `esbuild` build script in [`scripts/build-extension.mjs`](file:///Users/shahrukh/Desktop/sih/scripts/build-extension.mjs) generating bundled distributions in `apps/extension/dist/` (`privacy-core.bundle.js`, `content-action-runtime.bundle.js`, `popup.bundle.js`). Run via `npm run build:extension`.

[x] Implement Local DOM Action Driver & Fix False Success in `BrowserActionEngine`
* **Completed**: Created [`packages/privacy-core/src/dom-driver.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/dom-driver.js), updated [`apps/extension/src/action-runtime.js`](file:///Users/shahrukh/Desktop/sih/apps/extension/src/action-runtime.js) with full action execution and message bridge, fixed `BrowserActionEngine` to eliminate false success and propagate driver failures.

[x] Implement Live Remote LLM Provider Adapter (OpenRouter Gemma 4 26B A4B) in Reasoning Backend
* **Completed**: Created [`services/reasoning-backend/src/model-provider.js`](file:///Users/shahrukh/Desktop/sih/services/reasoning-backend/src/model-provider.js) with `ModelProvider` base class and `OpenRouterProvider` adapter for `google/gemma-4-26b-a4b`. Integrated into `SecureCommunicationClient` (`OpenRouterTransport`) and popup UI with runtime API key storage, structured tool mapping (`click`, `type`, `fill`, `scroll`, `wait`, `navigate`, `ask_user`), and zero raw PII leakage. Tested with 11 focused tests in [`tests/openrouter-model-provider.test.mjs`](file:///Users/shahrukh/Desktop/sih/tests/openrouter-model-provider.test.mjs).

---

## P2 — Medium Priority

[ ] Bundle On-Device OCR Model Binaries / Tesseract.js Worker
* **Why**: [`apps/extension/src/ocr-service.js`](file:///Users/shahrukh/Desktop/sih/apps/extension/src/ocr-service.js#L86-L104) has fallback hooks for `globalThis.Tesseract`, but actual Tesseract WASM binaries or ONNX visual model weights are not packaged in the repository.
* **Location**: [`apps/extension/src/ocr-service.js`](file:///Users/shahrukh/Desktop/sih/apps/extension/src/ocr-service.js), [`packages/privacy-core/src/visual-model-adapter.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/visual-model-adapter.js)
* **Depends on**: Extension build bundler
* **Expected result**: Extension runs local visual OCR text extraction on screenshots without making external cloud API requests.
* **Evidence**: [`packages/privacy-core/src/visual-model-adapter.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/visual-model-adapter.js).

[x] Extend Extension Popup UI for End-to-End Task Automation
* **Completed**: Added task runner input and execution trigger in [`apps/extension/popup.html`](file:///Users/shahrukh/Desktop/sih/apps/extension/popup.html) and [`apps/extension/src/popup.js`](file:///Users/shahrukh/Desktop/sih/apps/extension/src/popup.js) with real-time feedback and DOM action execution.
* **Location**: [`apps/extension/popup.html`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/apps/extension/popup.html), [`apps/extension/src/popup.js`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/apps/extension/src/popup.js)
* **Depends on**: Extension build bundler
* **Expected result**: Users can type a task instruction (e.g., "Search for laptops"), see live sanitized context status, view vault authorization prompts, and monitor executed actions.
* **Evidence**: [`DEMO_WALKTHROUGH.md`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/DEMO_WALKTHROUGH.md) Scenario 1 & 2 user workflows.

---

## P3 — Low Priority

[ ] Remove Unreferenced Duplicate Test File `tests/endend-to-end-privacy.test.mjs`
* **Why**: [`tests/endend-to-end-privacy.test.mjs`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/tests/endend-to-end-privacy.test.mjs) is an unreferenced duplicate of [`tests/end-to-end-privacy.test.mjs`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/tests/end-to-end-privacy.test.mjs) created during commit `3451b0b`.
* **Location**: [`tests/endend-to-end-privacy.test.mjs`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/tests/endend-to-end-privacy.test.mjs)
* **Depends on**: None
* **Expected result**: Clean `tests/` directory with only authoritative test files.
* **Evidence**: [`package.json`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/package.json) `test:privacy` script references `tests/end-to-end-privacy.test.mjs` only.

[ ] Update Root `README.md` Development Roadmap Checklist
* **Why**: [`README.md`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/README.md#L25-L34) still lists Step 2 as the current step, which lags behind the codebase where all 17 specification steps are completed.
* **Location**: [`README.md`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/README.md)
* **Depends on**: None
* **Expected result**: `README.md` documents all 17 completed steps and references [`DEPLOYMENT.md`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/DEPLOYMENT.md) and [`DEMO_WALKTHROUGH.md`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/DEMO_WALKTHROUGH.md).
* **Evidence**: Commit `3451b0b` ("all 17 steps done").
