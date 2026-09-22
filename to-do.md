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

### Milestone 7: Generic Multi-Step Agent Architecture, Task-Aware Privacy & Canonical Visual Redaction [COMPLETED]
- [x] Generic element discovery and container heuristics without website-specific selectors (`packages/privacy-core/src/interactive-element-registry.js`, `apps/extension/src/action-runtime.js`).
- [x] Semantic stale-target recovery in `BrowserActionEngine` resolving targets across dynamic DOM mutations.
- [x] Strict action intent separation (`ADD_TO_CART` vs `BUY_NOW` vs `SUBMIT_FORM`) preserving exact user task semantics.
- [x] Task-aware quad-state privacy policy (`REDACT`, `TOKENIZE`, `ALLOW`, `LOCAL_ONLY`) preventing over-redaction of non-sensitive metadata (titles, prices, buttons).
- [x] Vault tokenization API (`storeSecretWithToken`, `retrieveSecretByToken`) and local DOM value injection during browser action execution.
- [x] Canonical Bitmap Coordinate Transformation pipeline (`transformViewportToBitmap`, `transformPageToBitmap`, `transformYoloToBitmap`, `transformBitmapToViewport`) resolving spatial misalignment without arbitrary pixel offsets.
- [x] Comprehensive 25-requirement automated test suite in `tests/generic-agent-architecture.test.mjs` (20/20 test suites pass).

### Milestone 8: Compound User Intent & Generic UI Action Architecture [COMPLETED]
- [x] Generic action intent preservation in `GoalParser` (`perform_action` + `actionIntent`) for arbitrary actions (`subscribe`, `follow`, `bookmark`, `star`, `like`, `download`, `share`, `pin`, `play`, `favorite`).
- [x] Generic `perform_action` task planning in `TaskPlanner`.
- [x] Explicit UI action verification in `GoalCompletionChecker` ensuring `isSatisfied: false` until target action executes successfully.
- [x] Generic UI element matching in `apps/extension/src/popup.js` and `scripts/extension-log-server.mjs` matching accessible labels, visible text, and values without website selectors.
- [x] Dedicated test suite in `tests/compound-intent-resolution.test.mjs` (9/9 tests pass).

### Milestone 9: Generalized Intent & Context-Aware Architecture [COMPLETED]
- [x] Compositional intent model distinguishing named `ENTITY` from navigation `DESTINATION` (`packages/privacy-core/src/goal-parser.js`).
- [x] Preposition-derived candidate roles (`sender`, `source`, `author`, `recipient`, `brand`, `platform_scope`) as candidate hypotheses.
- [x] Open-ended target vocabulary extensible to unseen domains (`invoice`, `pull request`, `patient record`, `flight`, `resume`, `ticket`, `mail`, `document`, `paper`).
- [x] Context-aware & current-page-first execution in `TaskPlanner` preventing unnecessary navigation away from active web applications.
- [x] Strict navigation gating in `apps/extension/src/popup.js` honoring `requiresExplicitNavigation` and resolving candidates by ordinal and entity constraints.
- [x] Intent-based goal completion verification in `GoalCompletionChecker` verifying action execution on qualifying candidates.
- [x] Comprehensive 28-test synthetic verification suite in `tests/generalized-intent-architecture.test.mjs` (28/28 tests pass).

### Milestone 10: Task-Aware Privacy, Unified Sanitization, Telemetry Safety & Reviewer Visualization (Phases 1–6) [COMPLETED]
- [x] **Phase 1**: Formalized privacy contracts and data schemas (`TASK_AWARE_POLICY_DECISION_SHAPE`, `TASK_AWARE_POLICY_REASON_CODES`, `TASK_RELEVANCE_LEVELS`, `TASK_NECESSITY_LEVELS`, `SEMANTIC_ROLES`).
- [x] **Phase 2**: Generalized semantic role inference, task relevance, and operational necessity engine (`packages/privacy-core/src/context-analyzer.js`).
- [x] **Phase 3 & 3.1**: Authoritative deterministic 4-way privacy decision engine (`ALLOW`, `TOKENIZE`, `REDACT`, `LOCAL_ONLY`) enforcing data minimization and security invariants (`packages/privacy-core/src/policy-engine.js`).
- [x] **Phase 4**: Unified sanitization across DOM text, visual screenshot masks, and remote reasoning payloads consuming authoritative PolicyEngine decisions (`packages/privacy-core/src/sanitized-context-builder.js`, `image-redactor.js`, `dom-redactor.js`).
- [x] **Phase 5**: Telemetry Safety & Observability Invariant Enforcement (`packages/privacy-core/src/telemetry-sanitizer.js`, `apps/extension/src/popup.js`, `scripts/extension-log-server.mjs`, `multimodal-vision-agent.js`) ensuring logging, error handling, SSE streams, and task submission cannot bypass privacy boundaries.
- [x] **Phase 6**: End-to-End Privacy Validation & Reviewer Visualization (`packages/privacy-core/src/reviewer-transparency-engine.js`, `scripts/extension-log-server.mjs`, `tests/phase6-end-to-end-privacy-demo.test.mjs`) providing 4-way visual color badges (`🟢 ALLOW`, `🔴 TOKENIZE`, `⚫ REDACT`, `🔒 LOCAL_ONLY`), 7-class mixed content verification matrix, and adversarial cross-representation sentinel verification.

### Milestone 11: End-to-End Runtime Privacy Validation & Live Extension Transparency (Phase 7) [COMPLETED]
- [x] **Phase 7 Step 1**: Read-only source audit and runtime tracing verifying zero dual-decision duplication and single PolicyEngine authority.
- [x] **Phase 7 Step 2**: Live Extension Transparency Panel (`#live-privacy-transparency-panel`) in `apps/extension/popup.html` and dynamic runtime consumption via `renderPrivacyTransparency()` in `apps/extension/src/popup.js`.
- [x] **Controlled Generic Demo Fixture**: Pure mixed HTML fixture in `tests/fixtures/controlled-privacy-demo.html` with zero hardcoded decision metadata.
- [x] **LOCAL_ONLY Remote Egress Correction**: Verified secrets are completely excluded (`EXCLUDED`) from remote payloads while protected locally in DOM (`[LOCAL_ONLY_PROTECTED]`) and masked in screenshots.
- [x] **Token & Vault Consistency**: Verified single token consistency across DOM, Remote, PolicyEngine, and PrivacyVault.
- [x] **Dedicated Automated Test Suite**: 10-requirement validation suite in `tests/phase7-runtime-transparency.test.mjs` (10/10 tests pass).
- [x] **Zero Hardcoding Invariant**: Source audit verified zero website-specific or decision-mapping branches introduced.

---

## Next Enhancement Items

- [ ] **Physical ONNX Model Binaries in Extension Package**: Package trained `yolo_pii.onnx` and `vit_context.onnx` directly into `apps/extension/` for local visual inference.
- [ ] **Voice Input for Agent Tasks**: Add Web Speech API integration in extension popup.
- [ ] **Multi-Tab Orchestration**: Extend planner to coordinate tasks across multiple browser tabs concurrently.


