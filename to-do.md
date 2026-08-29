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

*None currently blocking core execution. (All 17 verification scripts and 287 automated unit tests are passing).*

[ ] Add `"type": "module"` declaration to root `package.json`
* **Why**: Node.js emits `[MODULE_TYPELESS_PACKAGE_JSON]` warnings when importing `.js` files from `services/reasoning-backend/` and `tests/fixtures/` because the root `package.json` does not specify `"type": "module"`.
* **Location**: [`package.json`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/package.json)
* **Depends on**: None
* **Expected result**: All `node --test` runs and script executions run completely clean with zero module typeless warnings.
* **Evidence**: Warning logged during `npm run test:privacy` and `node scripts/run-sih-demo.mjs`.

---

## P1 — High Priority

[ ] Configure Extension Build Bundler for `@privacy-agent/privacy-core`
* **Why**: [`apps/extension/src/policy-runtime.js`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/apps/extension/src/policy-runtime.js#L1-L3) currently uses a temporary mirror stub. A production bundler (Rollup / esbuild / Vite) is needed to bundle the full `@privacy-agent/privacy-core` ESM package directly into the Chrome extension's background worker and content scripts.
* **Location**: [`apps/extension/`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/apps/extension), [`package.json`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/package.json)
* **Depends on**: Steps 1–17 core library code
* **Expected result**: An `npm run build:extension` script that outputs bundled scripts into `apps/extension/dist/` ready to load in `chrome://extensions/`.
* **Evidence**: Explicit code comment in [`apps/extension/src/policy-runtime.js`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/apps/extension/src/policy-runtime.js#L1-L3).

[ ] Implement Live Remote LLM / VLM Provider Adapter in Reasoning Backend
* **Why**: [`services/reasoning-backend/src/reasoning-service.js`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/services/reasoning-backend/src/reasoning-service.js#L29-L99) currently runs `MockTestReasoningProvider`. A real HTTP client adapter is required to connect to external LLM endpoints (e.g. OpenAI GPT-4o-mini, Anthropic Claude 3.5 Sonnet, Gemini Flash, or local Ollama) in production.
* **Location**: [`services/reasoning-backend/src/reasoning-service.js`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/services/reasoning-backend/src/reasoning-service.js), [`services/reasoning-backend/src/reasoning-config.js`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/services/reasoning-backend/src/reasoning-config.js)
* **Depends on**: `validateRemotePayload`, `validateReasoningResponse`
* **Expected result**: Provider adapter that receives sanitized JSON context, formats system/user prompts for the LLM, invokes the LLM API over HTTPS, and parses JSON output into contract-valid `BROWSER_ACTION_TYPES` proposals.
* **Evidence**: Environment configuration in [`.env.example`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/.env.example) references `REASONING_BACKEND_URL` and `SECURE_TRANSPORT_MODE=REAL_REMOTE_TRANSPORT`.

---

## P2 — Medium Priority

[ ] Bundle On-Device OCR Model Binaries / Tesseract.js Worker
* **Why**: [`apps/extension/src/ocr-service.js`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/apps/extension/src/ocr-service.js#L86-L104) has fallback hooks for `globalThis.Tesseract`, but actual Tesseract WASM binaries or ONNX visual model weights are not packaged in the repository.
* **Location**: [`apps/extension/src/ocr-service.js`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/apps/extension/src/ocr-service.js), [`packages/privacy-core/src/visual-model-adapter.js`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/packages/privacy-core/src/visual-model-adapter.js)
* **Depends on**: Extension build bundler
* **Expected result**: Extension runs local visual OCR text extraction on screenshots without making external cloud API requests.
* **Evidence**: [`packages/privacy-core/src/visual-model-adapter.js`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/packages/privacy-core/src/visual-model-adapter.js).

[ ] Extend Extension Popup UI for End-to-End Task Automation
* **Why**: [`apps/extension/popup.html`](file:///c:/Users/ashri/.codex/.chatgpt-projects/g-p-6a905d6f723c81918ea039190416dff7/apps/extension/popup.html) currently only features buttons for "Capture Metadata" and "Scan Local PII". It needs an input field and execution trigger for end-to-end browser agent tasks.
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
