# Project Progress

> 📌 **Mandatory Note for AI Agents**: Read [`AGENTS.md`](AGENTS.md), [`to-do.md`](to-do.md), and this changelog first before proposing or executing code changes.

---

## Current Phase

* **Current Phase**: Observability Backend, Dual-Modality Transmission & CSP-Safe Navigation Completed.
* **Evidence & Rationale**:
  * **FACT**: All 17 verification scripts ([`scripts/check-structure.mjs`](scripts/check-structure.mjs) through [`scripts/check-step17-e2e.mjs`](scripts/check-step17-e2e.mjs)) pass with exit code `0`.
  * **FACT**: All 309 automated unit and integration tests across 15 core test suites pass (`309 pass, 0 fail`).
  * **FACT**: All 19 generic DOM action and observability backend test suites in [`tests/generic-dom-actions.test.mjs`](tests/generic-dom-actions.test.mjs) and [`tests/observability-backend.test.mjs`](tests/observability-backend.test.mjs) pass (`19 pass, 0 fail`).
  * **FACT**: Live Observability Backend & Real-time Web Dashboard running on port `8765` ([`scripts/extension-log-server.mjs`](scripts/extension-log-server.mjs)), providing live SSE telemetry streaming, JSON audit export, and visual agent reasoning ingestion.
  * **FACT**: Dual-modality transmission engine ([`packages/privacy-core/src/multimodal-vision-agent.js`](packages/privacy-core/src/multimodal-vision-agent.js)) dispatches on-device redacted screenshots alongside sanitized DOM metadata to visual reasoning models (such as `Qwen/Qwen3-VL-4B-Instruct`).
  * **FACT**: `safeClick` implementation in [`apps/extension/src/action-runtime.js`](apps/extension/src/action-runtime.js) and [`packages/privacy-core/src/dom-driver.js`](packages/privacy-core/src/dom-driver.js) disarms `javascript:void(0)` links during click events, completely eliminating Chrome Manifest V3 Content Security Policy navigation violations.
  * **FACT**: Native in-popup reload button (`#btn-reload-extension`) wired directly to `chrome.runtime.reload()` enables 1-click unpacked extension reloads without triggering browser CSP violations.

---

## Overall Status

* **Status**: 100% Core, Extension, Multimodal Vision, and Observability Integration Complete.
* **Tested Test Suites**: 17 suites, 328 passing tests.
* **Estimation Basis**:
  * Core Privacy Engine, Multi-Signal Perception, Vault, Sanitizer, Action Engine, Transport, and End-to-End Orchestrator are fully implemented and verified.
  * Extension bundling tooling ([`scripts/build-extension.mjs`](scripts/build-extension.mjs)) compiles [`packages/privacy-core`](packages/privacy-core) into [`apps/extension/dist`](apps/extension/dist).
  * Machine learning training pipeline ([`models/sih_training_pipeline.py`](models/sih_training_pipeline.py)) covers YOLOv8 and ViT on MPS, CUDA, and CPU.

---

## Chronological Implementation Log

### Step 1: Monorepo Structure & Workspace Configuration
* *Completed*: Workspace configuration for `apps/*`, `packages/*`, and `services/*`, npm scripts, and Node.js $\ge$ 20 engine definition.
* *Relevant files*: [`package.json`](package.json), [`.gitignore`](.gitignore), [`.env.example`](.env.example).
* *Evidence*: [`scripts/check-structure.mjs`](scripts/check-structure.mjs) validates all directory invariants.

### Step 2: Manifest V3 Chrome Extension Foundation & Metadata Extraction
* *Completed*: MV3 manifest, popup UI, permissions (`activeTab`, `scripting`, `storage`), and safe page metadata capture script.
* *Relevant files*: [`apps/extension/manifest.json`](apps/extension/manifest.json), [`apps/extension/popup.html`](apps/extension/popup.html), [`apps/extension/src/content-metadata.js`](apps/extension/src/content-metadata.js).
* *Evidence*: [`scripts/check-extension.mjs`](scripts/check-extension.mjs) passes.

### Step 3: Core Privacy Policy Contracts & Safe Defaults
* *Completed*: 4-way decision framework (`ALLOW`, `LOCAL_ONLY`, `TOKENIZE`, `REDACT`), conservative fallback logic.
* *Relevant files*: [`packages/privacy-core/src/policy.js`](packages/privacy-core/src/policy.js), [`packages/shared-types/src/privacy-contracts.js`](packages/shared-types/src/privacy-contracts.js), [`tests/privacy-policy.test.mjs`](tests/privacy-policy.test.mjs).
* *Evidence*: [`scripts/check-privacy.mjs`](scripts/check-privacy.mjs) passes; 6 unit tests pass.

### Step 4: DOM PII Detection & Luhn-Verified Payment Card Scanning
* *Completed*: Pattern-based PII detector for email, phone numbers, SSNs, OTPs, and Luhn-validated credit cards.
* *Relevant files*: [`packages/privacy-core/src/detection.js`](packages/privacy-core/src/detection.js), [`apps/extension/src/content-pii.js`](apps/extension/src/content-pii.js).
* *Evidence*: [`scripts/check-pii-detector.mjs`](scripts/check-pii-detector.mjs) passes.

### Step 5: Spatial Localization & Bounding Box Coordinates
* *Completed*: Coordinate mapping for detected entities (`x`, `y`, `width`, `height`), placeholder formatting.
* *Relevant files*: [`packages/privacy-core/src/localization.js`](packages/privacy-core/src/localization.js), [`tests/localization.test.mjs`](tests/localization.test.mjs).
* *Evidence*: [`scripts/check-step5-localization.mjs`](scripts/check-step5-localization.mjs) passes; 6 unit tests pass.

### Step 6: Multi-Signal Fusion, Semantic DOM Analysis & OCR Fragment Reconstruction
* *Completed*: DOM semantic attribute inspection (type, autocomplete, aria, labels), OCR fragment stitching, bounding box overlap resolution, weighted multi-signal confidence computation.
* *Relevant files*: [`packages/privacy-core/src/dom-semantics.js`](packages/privacy-core/src/dom-semantics.js), [`packages/privacy-core/src/fusion.js`](packages/privacy-core/src/fusion.js), [`packages/privacy-core/src/config.js`](packages/privacy-core/src/config.js), [`tests/robust-detection.test.mjs`](tests/robust-detection.test.mjs).
* *Evidence*: [`scripts/check-step6-robustness.mjs`](scripts/check-step6-robustness.mjs) passes; 10 unit tests pass.

### Step 7: Task Intent Classification & PII Relevance Evaluation
* *Completed*: Intent parsing (`FORM_FILLING`, `SEARCH`, `LOGIN`, `PAYMENT`), PII relevance grading (`REQUIRED`, `OPTIONAL`, `IRRELEVANT`, `UNKNOWN`), contextual evidence tracking.
* *Relevant files*: [`packages/privacy-core/src/context-analyzer.js`](packages/privacy-core/src/context-analyzer.js), [`tests/context-analyzer.test.mjs`](tests/context-analyzer.test.mjs).
* *Evidence*: [`scripts/check-step7-context.mjs`](scripts/check-step7-context.mjs) passes; 14 unit tests pass.

### Step 8: Privacy Policy Engine & Remote Boundary Protection
* *Completed*: Comprehensive policy evaluation engine with precedence rules, confidence guards, non-sensitive opaque token generation (`generateOpaqueToken`), deep recursive payload sanitization (`sanitizeRemotePayload`).
* *Relevant files*: [`packages/privacy-core/src/policy-engine.js`](packages/privacy-core/src/policy-engine.js), [`packages/privacy-core/src/policy-config.js`](packages/privacy-core/src/policy-config.js), [`tests/privacy-policy-engine.test.mjs`](tests/privacy-policy-engine.test.mjs).
* *Evidence*: [`scripts/check-step8-policy.mjs`](scripts/check-step8-policy.mjs) passes; 26 unit tests pass.

### Step 9: Secure Temporary In-Memory Local Privacy Vault
* *Completed*: In-memory local vault for storing secrets during local browser actions; TTL expiration, purpose isolation (`VAULT_PURPOSES`), revocation (`revokeSecret`), capacity limits (100 entries), zero remote destination leakage (`DENIED_REMOTE_DESTINATION`).
* *Relevant files*: [`packages/privacy-core/src/privacy-vault.js`](packages/privacy-core/src/privacy-vault.js), [`packages/privacy-core/src/vault-config.js`](packages/privacy-core/src/vault-config.js), [`tests/privacy-vault.test.mjs`](tests/privacy-vault.test.mjs).
* *Evidence*: [`scripts/check-step9-vault.mjs`](scripts/check-step9-vault.mjs) passes; 24 unit tests pass.

### Step 10: On-Device OCR / Visual Perception Adapter
* *Completed*: `VisualModelAdapter` supporting local OCR engines, bounding box normalization, confidence mapping, DOM fusion integration.
* *Relevant files*: [`packages/privacy-core/src/visual-model-adapter.js`](packages/privacy-core/src/visual-model-adapter.js), [`packages/privacy-core/src/visual-config.js`](packages/privacy-core/src/visual-config.js), [`apps/extension/src/ocr-service.js`](apps/extension/src/ocr-service.js), [`tests/on-device-ocr.test.mjs`](tests/on-device-ocr.test.mjs).
* *Evidence*: [`scripts/check-step10-visual.mjs`](scripts/check-step10-visual.mjs) passes; 20 unit tests pass.

### Step 11: Sanitized Page State & Remote Reasoning Context Builder
* *Completed*: `SanitizedContextBuilder` converting DOM and OCR into safe payload representation; stripping dangerous tags (`<script>`, `<iframe>`, `<object>`, `<embed>`), stripping inline event handlers (`onclick`), tokenizing sensitive inputs, preserving spatial coordinates for visual reasoning.
* *Relevant files*: [`packages/privacy-core/src/sanitized-context-builder.js`](packages/privacy-core/src/sanitized-context-builder.js), [`packages/privacy-core/src/sanitizer-config.js`](packages/privacy-core/src/sanitizer-config.js), [`tests/sanitized-context.test.mjs`](tests/sanitized-context.test.mjs).
* *Evidence*: [`scripts/check-step11-sanitized-context.mjs`](scripts/check-step11-sanitized-context.mjs) passes; 26 unit tests pass.

### Step 12: ONNX Runtime Web / Local ML Inference Adapter
* *Completed*: `OnnxRuntimeAdapter` managing local inference sessions (`wasm`, `webgpu`, `cpu`, `mock_test`), tensor shape and dtype validation, timeout handling, lifecycle management.
* *Relevant files*: [`packages/privacy-core/src/onnx-runtime-adapter.js`](packages/privacy-core/src/onnx-runtime-adapter.js), [`packages/privacy-core/src/onnx-config.js`](packages/privacy-core/src/onnx-config.js), [`tests/onnx-runtime.test.mjs`](tests/onnx-runtime.test.mjs).
* *Evidence*: [`scripts/check-step12-onnx.mjs`](scripts/check-step12-onnx.mjs) passes; 25 unit tests pass.

### Step 13: WebGPU Hardware Acceleration & Fallback Architecture
* *Completed*: `WebGpuManager` with two-stage capability detection (browser API + ONNX provider check), graceful fallback to WASM, non-fingerprinting capability limits (omitting vendor strings).
* *Relevant files*: [`packages/privacy-core/src/webgpu-manager.js`](packages/privacy-core/src/webgpu-manager.js), [`packages/privacy-core/src/webgpu-config.js`](packages/privacy-core/src/webgpu-config.js), [`tests/webgpu-acceleration.test.mjs`](tests/webgpu-acceleration.test.mjs).
* *Evidence*: [`scripts/check-step13-webgpu.mjs`](scripts/check-step13-webgpu.mjs) passes; 28 unit tests pass.

### Step 14: Browser Action Engine & Absolute Execution Authority
* *Completed*: `BrowserActionEngine` validating and executing browser actions locally; stale target protection, policy and vault authorization checks, navigation protocol validation (blocking `javascript:`, `data:`, `file:`), local DOM driver bridge.
* *Relevant files*: [`packages/privacy-core/src/browser-action-engine.js`](packages/privacy-core/src/browser-action-engine.js), [`packages/privacy-core/src/action-config.js`](packages/privacy-core/src/action-config.js), [`apps/extension/src/action-runtime.js`](apps/extension/src/action-runtime.js), [`tests/browser-action.test.mjs`](tests/browser-action.test.mjs).
* *Evidence*: [`scripts/check-step14-actions.mjs`](scripts/check-step14-actions.mjs) passes; 30 unit tests pass.

### Step 15: Remote Reasoning Backend Service & Payload Validators
* *Completed*: Remote reasoning service interface, recursive deep content validator (`validateRemotePayload` rejecting raw PII, image buffers, scripts), response schema validator (`validateReasoningResponse`), `MockTestReasoningProvider`.
* *Relevant files*: [`services/reasoning-backend/src/reasoning-service.js`](services/reasoning-backend/src/reasoning-service.js), [`services/reasoning-backend/src/payload-validator.js`](services/reasoning-backend/src/payload-validator.js), [`services/reasoning-backend/src/response-validator.js`](services/reasoning-backend/src/response-validator.js), [`tests/remote-reasoning.test.mjs`](tests/remote-reasoning.test.mjs).
* *Evidence*: [`scripts/check-step15-reasoning.mjs`](scripts/check-step15-reasoning.mjs) passes; 22 unit tests pass.

### Step 16: Secure Communication Client & Zero-Egress Transport Firewall
* *Completed*: Pre-serialization failsafe scan, dynamic auth token injection, HTTPS enforcement, UTF-8 payload size verification, transport error classification.
* *Relevant files*: [`packages/privacy-core/src/secure-communication-client.js`](packages/privacy-core/src/secure-communication-client.js), [`packages/privacy-core/src/communication-config.js`](packages/privacy-core/src/communication-config.js), [`tests/secure-communication.test.mjs`](tests/secure-communication.test.mjs).
* *Evidence*: [`scripts/check-step16-secure-communication.mjs`](scripts/check-step16-secure-communication.mjs) passes; 26 unit tests pass.

### Step 17: End-to-End Privacy Coordinator & Automated Demonstration
* *Completed*: `BrowserAgentCoordinator` orchestrating the complete lifecycle, performance benchmarking, dynamic security audit, reproducible 3-scenario demo runner.
* *Relevant files*: [`packages/privacy-core/src/browser-agent-coordinator.js`](packages/privacy-core/src/browser-agent-coordinator.js), [`scripts/run-sih-demo.mjs`](scripts/run-sih-demo.mjs), [`DEMO_WALKTHROUGH.md`](DEMO_WALKTHROUGH.md), [`DEPLOYMENT.md`](DEPLOYMENT.md).
* *Evidence*: [`scripts/check-step17-e2e.mjs`](scripts/check-step17-e2e.mjs) passes; 16 integration tests pass.

### Step 18: Observability Backend, Dual-Modality Transmission & CSP Defense
* *Completed*:
  1. **Live Telemetry Server & Dashboard**: Built [`scripts/extension-log-server.mjs`](scripts/extension-log-server.mjs) serving an interactive dashboard on `http://127.0.0.1:8765` with SSE events, stage filtering, and `/api/export` JSON audit logs.
  2. **Dual-Modality Multimodal Vision Agent**: Created [`packages/privacy-core/src/multimodal-vision-agent.js`](packages/privacy-core/src/multimodal-vision-agent.js) generating on-device redacted screenshots (blacking out detected PII bounding boxes) combined with sanitized DOM trees (`el_1`, `el_2`) dispatched to vision models like `Qwen/Qwen3-VL-4B-Instruct`.
  3. **CSP-Safe Action Runtime**: Implemented `safeClick` in [`apps/extension/src/action-runtime.js`](apps/extension/src/action-runtime.js) and `safeClickElement` in [`packages/privacy-core/src/dom-driver.js`](packages/privacy-core/src/dom-driver.js) to disarm `javascript:void(0)` and `javascript:` URLs during clicks, resolving Chrome MV3 CSP navigation errors.
  4. **Native In-Popup Reload Button**: Added `#btn-reload-extension` in [`apps/extension/popup.html`](apps/extension/popup.html) and wired native `chrome.runtime.reload()` in [`apps/extension/src/popup.js`](apps/extension/src/popup.js).
* *Evidence*: [`tests/observability-backend.test.mjs`](tests/observability-backend.test.mjs) and [`tests/generic-dom-actions.test.mjs`](tests/generic-dom-actions.test.mjs) pass with 19/19 passing tests.
<<<<<<< Updated upstream
=======

### Step 19: Generic Multi-Step Browser Agent, Task-Aware Privacy & Canonical Visual Redaction
* *Completed*:
  1. **Generic Multi-Step Execution & Semantic Stale-Target Recovery**: Eliminated domain-specific selector hardcoding across [`packages/privacy-core/src/interactive-element-registry.js`](packages/privacy-core/src/interactive-element-registry.js), [`apps/extension/src/action-runtime.js`](apps/extension/src/action-runtime.js), and [`scripts/extension-log-server.mjs`](scripts/extension-log-server.mjs). Added generic dynamic re-perception and semantic fallback recovery in [`packages/privacy-core/src/browser-action-engine.js`](packages/privacy-core/src/browser-action-engine.js).
  2. **Strict Action Intent Separation**: Enforced strict task-aware action differentiation (`add_to_cart` $\neq$ `buy_now` $\neq$ `submit_form`) across the planner, goal checker, and autonomous decision server.
  3. **Task-Aware Privacy Policy & Vault Token Resolution**: Fixed over-redaction by properly differentiating `REDACT` (irrelevant PII), `TOKENIZE` (task-relevant PII mapped to opaque tokens), `ALLOW` (product titles, prices, specs, button labels), and `LOCAL_ONLY` (passwords, OTPs). Added token mapping and resolution APIs in [`packages/privacy-core/src/privacy-vault.js`](packages/privacy-core/src/privacy-vault.js) and local injection in `BrowserActionEngine`.
  4. **Canonical Bitmap Coordinate Transformation Pipeline**: Solved visual masking misalignment in [`packages/privacy-core/src/localization.js`](packages/privacy-core/src/localization.js) with deterministic transforms (`transformViewportToBitmap`, `transformPageToBitmap`, `transformYoloToBitmap`, `transformBitmapToViewport`) accounting for `devicePixelRatio`, scroll offsets, and model letterbox padding without arbitrary spatial offsets.
* *Evidence*: [`tests/generic-agent-architecture.test.mjs`](tests/generic-agent-architecture.test.mjs) verifies all 25 architectural requirements (20/20 test suites pass; 355/355 core tests pass; 45/45 total unit & integration test suites pass).

### Step 20: Compound User Intent & Generic UI Action Architecture
* *Completed*:
  1. **Generic Compound Intent Preservation**: Modified [`packages/privacy-core/src/goal-parser.js`](packages/privacy-core/src/goal-parser.js) to preserve arbitrary compound action intents (`perform_action` + `actionIntent: string`) such as `subscribe`, `follow`, `bookmark`, `star`, `like`, `download`, `share`, `pin`, `play`, `favorite`, without stripping trailing verbs or creating per-verb operation enums. Preserved exact target entities and regression behavior for `add_to_cart` and standard search.
  2. **Generic Action Planning**: Updated [`packages/privacy-core/src/task-planner.js`](packages/privacy-core/src/task-planner.js) to generate generic `perform_action` tasks carrying `actionIntent`.
  3. **Multi-Stage Goal Completion Verification**: Updated [`packages/privacy-core/src/goal-checker.js`](packages/privacy-core/src/goal-checker.js) so that `isSatisfied` remains `false` until requested explicit UI actions genuinely succeed, preventing premature termination after navigation/search.
  4. **Intent Preservation & Generic Action Matching in Runtime & Server**: Updated [`apps/extension/src/popup.js`](apps/extension/src/popup.js), [`packages/privacy-core/src/execution-state-manager.js`](packages/privacy-core/src/execution-state-manager.js), and [`scripts/extension-log-server.mjs`](scripts/extension-log-server.mjs) to match target interactive elements generically against `actionIntent` using visible text, accessible names, values, and titles without website-specific selectors.
* *Evidence*: Dedicated test suite [`tests/compound-intent-resolution.test.mjs`](tests/compound-intent-resolution.test.mjs) passing 9/9 compound & regression tests; 87/87 integration tests passing; 355/355 core tests passing.

### Step 22: Task-Aware Privacy, Unified Sanitization & Telemetry Safety (Phases 1–5)
* *Completed*:
  1. **Phase 1: Formalized Privacy Contracts & Schemas**: Added `TASK_AWARE_POLICY_DECISION_SHAPE`, `TASK_AWARE_POLICY_REASON_CODES`, `TASK_RELEVANCE_LEVELS`, `TASK_NECESSITY_LEVELS`, and `SEMANTIC_ROLES` in [`packages/shared-types/src/privacy-contracts.js`](packages/shared-types/src/privacy-contracts.js).
  2. **Phase 2: Generalized Context Analyzer**: Implemented task relevance, semantic role inference, and operational necessity engine in [`packages/privacy-core/src/context-analyzer.js`](packages/privacy-core/src/context-analyzer.js).
  3. **Phase 3 & 3.1: Authoritative PolicyEngine & Deterministic 4-Way Decisions**: Implemented single authoritative decision engine in [`packages/privacy-core/src/policy-engine.js`](packages/privacy-core/src/policy-engine.js) returning `ALLOW`, `TOKENIZE`, `REDACT`, or `LOCAL_ONLY`.
  4. **Phase 4: Unified Sanitization**: Unified DOM text sanitization ([`dom-redactor.js`](packages/privacy-core/src/dom-redactor.js)), screenshot masking ([`image-redactor.js`](packages/privacy-core/src/image-redactor.js)), and remote reasoning payload builder ([`sanitized-context-builder.js`](packages/privacy-core/src/sanitized-context-builder.js)) to consume authoritative PolicyEngine decisions.
  5. **Phase 5: Telemetry Safety & Observability Invariant Enforcement**: Created [`packages/privacy-core/src/telemetry-sanitizer.js`](packages/privacy-core/src/telemetry-sanitizer.js) and wrapped all outbound telemetry, user tasks, errors, and SSE log paths in [`apps/extension/src/popup.js`](apps/extension/src/popup.js), [`scripts/extension-log-server.mjs`](scripts/extension-log-server.mjs), and [`packages/privacy-core/src/multimodal-vision-agent.js`](packages/privacy-core/src/multimodal-vision-agent.js) ensuring telemetry cannot become a privacy bypass.
* *Evidence*: Dedicated test suite [`tests/phase5-telemetry-safety.test.mjs`](tests/phase5-telemetry-safety.test.mjs) (10/10 tests pass); all Phase 1–5 regression test suites (222/222 tests pass across 14 test suites); zero hardcoded website patterns; extension builds successfully.

### Step 23: End-to-End Privacy Validation & Reviewer Visualization (Phase 6)
* *Completed*:
  1. **Reviewer Transparency Engine**: Implemented [`packages/privacy-core/src/reviewer-transparency-engine.js`](packages/privacy-core/src/reviewer-transparency-engine.js) with `formatReviewerDecisionBadge()`, `evaluateMixedContentDemo()`, and `assertCrossRepresentationConsistency()`.
  2. **4-Way Presentation Legend**: Established clear non-authoritative presentation badges: `🟢 ALLOW` (green), `🔴 TOKENIZE` (red with opaque token), `⚫ REDACT` (black mask), and `🔒 LOCAL_ONLY` (protected purple/gold secret).
  3. **Live Dashboard Privacy Inspector**: Added `🛡️ Privacy Transparency` tab in [`scripts/extension-log-server.mjs`](scripts/extension-log-server.mjs) with an interactive 1-click 7-class mixed content verification matrix runner and live session privacy decisions table.
  4. **Cross-Representation Sentinel Verification**: Added dedicated test suite [`tests/phase6-end-to-end-privacy-demo.test.mjs`](tests/phase6-end-to-end-privacy-demo.test.mjs) executing Tests A through J (including sentinel leak scans for `PHASE6_SECRET_SENTINEL_9X7Q`, `PHASE6_EMAIL_SENTINEL_4M2K`, `PHASE6_PASSWORD_SENTINEL_8P3R`).
* *Evidence*: All 552/552 tests pass across 38 test suites (`552 pass, 0 fail`); extension builds cleanly via [`scripts/build-extension.mjs`](scripts/build-extension.mjs); zero hardcoded selectors/rules; frozen architecture verified 100% intact.
### Step 25: Laya-Powered Policy Confidence Layer (v2)
* *Completed*:
  1. **Dataset Generation & Adversarial Hardening**: Generated a 369-row balanced dataset across `ALLOW`, `TOKENIZE`, `REDACT`, and `LOCAL_ONLY` with 104 adversarial cases (partial/masked cards, split DOM sibling nodes, non-US IDs, incidental contexts) split into `train.jsonl` (259), `calib.jsonl` (55), and `held_out.jsonl` (55) in [`datasets/policy-decisions/`](datasets/policy-decisions/).
  2. **LoRA Fine-Tuning & Training Provenance**: Trained a PEFT LoRA adapter (`r=8, alpha=16, dropout=0.1`) targeting ModernBERT attention projection layers (`Wqkv`, `Wo`) with side-by-side loss tracking and early stopping on calibration loss. Exported complete provenance receipt to [`models/laya-policy-checkpoint/training_config.json`](models/laya-policy-checkpoint/training_config.json) and [`training_history.json`](models/laya-policy-checkpoint/training_history.json).
  3. **Temperature Calibration & Threshold Sweep**: Derived optimal temperature scaling parameter $T^* = 1.555$ via L-BFGS to calibrate probabilities, and performed an empirical threshold sweep across $\theta \in [0.50, 0.95]$ deriving optimal operating threshold $\theta^* = 0.74$ on the calibration split, saved in [`models/laya-policy-checkpoint/calibration_params.json`](models/laya-policy-checkpoint/calibration_params.json).
  4. **Local Loopback Service**: Created an offline FastAPI service in [`services/laya-confidence/`](services/laya-confidence/) strictly bound to `127.0.0.1:8766` providing `/health`, `/score`, and batched multi-element `/score-batch`. Verified 100% loopback isolation with zero external network egress.
  5. **Additive PolicyEngine Integration**: Implemented [`packages/privacy-core/src/laya-confidence-client.js`](packages/privacy-core/src/laya-confidence-client.js) (with hardware-adaptive timeout and offline fail-safe handling) and added `evaluatePolicyWithConfidence()` to [`packages/privacy-core/src/policy-engine.js`](packages/privacy-core/src/policy-engine.js). Authoritative rule-based decision logic remains strictly authoritative and unchanged.
  6. **Held-Out Evaluation & Dedicated Testing**: Evaluated held-out test split, reporting raw denominators ($N_{\text{caught}} / N_{\text{rule\_errors}}$) and False Flag Rate (0.0%), checked in to [`results/`](results/). Created dedicated unit test suite [`tests/phase-laya-confidence.test.mjs`](tests/phase-laya-confidence.test.mjs) verifying all 10 requirements.
* *Evidence*: Dedicated test suite [`tests/phase-laya-confidence.test.mjs`](tests/phase-laya-confidence.test.mjs) passes 10/10 tests; baseline regression suite (`npm test`) passes 355/355 core privacy tests with 0 failures; extension builds cleanly via [`scripts/build-extension.mjs`](scripts/build-extension.mjs).

>>>>>>> Stashed changes
