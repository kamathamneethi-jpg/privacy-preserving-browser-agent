# TODO & Roadmap Status

> 📌 **Note for Incoming AI Agents**: Always review [`AGENTS.md`](AGENTS.md) and [`progress.md`](progress.md) first before undertaking tasks.

---

## Current Focus & System Status

The **Privacy-Preserving Browser Agent** is fully functional end-to-end:
- **Core Library**: `@privacy-agent/privacy-core` (309/309 privacy & core tests passing; 19/19 DOM & observability tests passing).
- **Chrome Extension**: Manifest V3 extension in `apps/extension/` bundled via esbuild (`node scripts/build-extension.mjs`).
- **Live Observability Backend & Telemetry Dashboard**: Active server on port `8765` (`node scripts/extension-log-server.mjs`) serving real-time SSE telemetry, audit logs, and dashboard at `http://127.0.0.1:8765`.
- **Dual-Modality Agent Transmission**: On-device visual PII blackout generating redacted screenshots + sanitized DOM element metadata dispatched simultaneously to the reasoning model.
- **CSP-Safe Browser Runtime**: `safeClick` engine disarming `javascript:void(0)` and pseudo-protocols to eliminate Chrome MV3 CSP navigation errors.
- **In-Popup Extension Reloader**: Built-in `🔄 Reload` button triggering native `chrome.runtime.reload()` for 1-click reloading.
- **On-Device ML Pipeline**: 5-stage Python training pipeline (`models/sih_training_pipeline.py`) for YOLOv8 (visual PII detection) and ViT (page context safety classification), exportable to ONNX Runtime Web.

---

## Critical Path Milestones

### Milestone 1: Zero-Leakage Privacy Core [COMPLETED]
- [x] On-Device DOM + PII detection and classification (`packages/privacy-core/`).
- [x] Tokenization & vault secret management (`packages/privacy-core/src/policy-engine.js`, `packages/privacy-core/src/privacy-vault.js`).
- [x] Secure Communication Client blocking all raw secrets, raw DOM, and image buffers over the wire (`packages/privacy-core/src/secure-communication-client.js`).
- [x] WebGPU hardware acceleration with CPU/WASM fallback (`packages/privacy-core/src/webgpu-manager.js`).
- [x] 309 automated privacy unit & integration tests passing.

### Milestone 2: Chrome Extension Integration [COMPLETED]
- [x] Manifest V3 architecture with `"scripting"`, `"storage"`, and `<all_urls>` permissions (`apps/extension/manifest.json`).
- [x] ESBuild bundler injecting `.env` variables into build artifacts (`scripts/build-extension.mjs`).
- [x] Resilient tab messaging with programmatic `chrome.scripting.executeScript` fallback.
- [x] Interactive popup interface with settings toggle, PII detection badges, live action feedback, and native `🔄 Reload` button (`apps/extension/popup.html`).

### Milestone 3: Generic DOM Perception & Autonomous Multi-Step Execution [COMPLETED]
- [x] Dynamic DOM element discovery assigning opaque IDs (`el_1`, `el_2`, ...) and bounding boxes (`packages/privacy-core/src/interactive-element-registry.js`).
- [x] Checkbox, radio button, and eCommerce filter detection (`.a-checkbox-label`, `li[id^="p_"] a`, price inputs).
- [x] Multi-step Re-Act agent loop (`MAX_STEPS = 6`) in `apps/extension/src/popup.js` with DOM settlement pauses.
- [x] Auto-navigation from internal browser tabs (`chrome://newtab`, `about:blank`) or requested URLs.
- [x] eCommerce intent disambiguation (search query keyword isolation vs. Add to Cart / Buy Now actions).

### Milestone 4: Remote Model Reasoning & Free Inference Providers [COMPLETED]
- [x] Hugging Face free serverless inference adapter with `Qwen/Qwen3-VL-4B-Instruct` (Free Visual Agent model).
- [x] OpenRouter free-tier adapter (`qwen/qwen-2.5-vl-72b-instruct:free`, `google/gemma-2-9b-it:free`) and Groq adapter (`llama-3.3-70b-versatile`).
- [x] Local On-Device Heuristic Planner fallback (zero API key, zero egress, 100% free offline mode).
- [x] Authoritative local action execution (`CLICK`, `TYPE`, `CHECK`, `SELECT`, `PRESS_KEY`, `SUBMIT`).

### Milestone 5: Observability Backend, Live Dashboard & CSP Defense [COMPLETED]
- [x] Real-time Observability Server (`scripts/extension-log-server.mjs`) on port `8765`.
- [x] Live web dashboard at `http://127.0.0.1:8765` featuring real-time SSE streaming, stage filtering, and payload inspector.
- [x] JSON audit log export endpoint (`GET /api/export`).
- [x] CSP-Safe `safeClick` engine disarming `javascript:void(0)` anchor navigations during clicks in `apps/extension/src/action-runtime.js` and `packages/privacy-core/src/dom-driver.js`.
- [x] In-popup native extension reload handler calling `chrome.runtime.reload()`.

### Milestone 6: On-Device Vision ML Training Pipeline [COMPLETED]
- [x] Created `models/sih_training_pipeline.py` with 5 executable stages:
  - `install`: Dependencies installation (YOLOv8, ViT, PyTorch, ONNX).
  - `download`: WIDER FACE, MIDV-500, Synthetic cards, WebSRC, Mind2Web.
  - `preprocess`: YOLO annotation format converter and ViT dataset generator.
  - `train_yolo`: YOLOv8n visual PII / document / card detector.
  - `train_vit`: ViT page context safety classifier.
  - `export`: ONNX export for on-device browser deployment via ONNX Runtime Web.

---

## Next Enhancement Items

- [ ] **Physical ONNX Model Binaries in Extension Package**: Package trained `yolo_pii.onnx` and `vit_context.onnx` directly into `apps/extension/` for local visual inference.
- [ ] **Voice Input for Agent Tasks**: Add Web Speech API integration in extension popup.
- [ ] **Multi-Tab Orchestration**: Extend planner to coordinate tasks across multiple browser tabs concurrently.
