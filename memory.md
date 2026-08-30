# Project Memory

## 1. Project Purpose

The **Privacy-Preserving Lightweight Browser Agent** is an on-device Chrome/Chromium browser agent built for the Smart India Hackathon (SIH) 2026. 

Its primary objective is to allow AI-driven browser automation and webpage comprehension while providing mathematical and architectural guarantees that **raw personally identifiable information (PII), credentials, passwords, credit card numbers, OTPs, and vault secrets NEVER leave the user's local device or cross the remote network boundary**.

---

## 2. Original Plan

As documented in early architectural notes ([`README.md`](file:///Users/shahrukh/Desktop/sih/README.md) and [`docs/architecture.md`](file:///Users/shahrukh/Desktop/sih/docs/architecture.md)), the project was originally conceived as a 7-stage roadmap:
1. Monorepo and workspace setup.
2. Minimal Chrome Extension to capture safe page metadata.
3. Local privacy policy engine with safe defaults (`REDACT`, `TOKENIZE`, `LOCAL_ONLY`, `ALLOW`).
4. DOM-based PII detection and tokenization.
5. Screenshot / OCR and ONNX Runtime Web integration.
6. Sanitized remote reasoning API.
7. User-authorized browser actions and end-to-end integration tests.

---

## 3. How the Project Evolved

The project evolved from a high-level 7-stage concept into an explicit **17-step hardened modular architecture** (verified by 17 standalone verification scripts and 14 test suites covering 287 automated tests):

* **Multi-Signal Fusion (Steps 4–6)**: Detection was expanded beyond basic regex to combine DOM text parsing, DOM element semantic attributes (`autocomplete`, `aria-label`, `type`, label associations), and OCR text blocks with bounding box overlap resolution and weighted confidence scoring.
* **Context & Intent Awareness (Step 7)**: Introduced a dedicated Context Analyzer to infer task intent (`SEARCH`, `FORM_FILLING`, `LOGIN`, `PAYMENT`, etc.) and classify PII items by task relevance (`REQUIRED`, `OPTIONAL`, `IRRELEVANT`, `UNKNOWN`).
* **Policy Engine Precedence (Step 8)**: Standardized 4 distinct policy actions with strict confidence thresholds, unknown destination traps, and non-sensitive opaque token generation (`PII_TOKEN_<CATEGORY>_<RANDOM>`).
* **Secure In-Memory Local Vault (Step 9)**: Created a temporary, in-memory isolated vault on the local side of the boundary to hold sensitive secrets (e.g. payment credentials, passwords) for authorized local form filling with time-to-live (TTL) bounds and purpose isolation.
* **Sanitized Context Builder (Step 11)**: Implemented deep structural sanitization that strips dangerous HTML elements (`<script>`, `<iframe>`, `<object>`, `<embed>`), removes inline event handlers (`onclick`), and masks sensitive attributes while preserving spatial bounding box geometry for AI visual reasoning.
* **Hardware-Aware Local Inference (Steps 12 & 13)**: Built adapters for ONNX Runtime Web and WebGPU with two-stage capability detection (browser API check + ONNX provider check) and graceful fallback to WASM/CPU.
* **Execution Authority Invariant (Step 14)**: Enforced that the remote reasoning service produces **action proposals only**; the local `BrowserActionEngine` holds 100% execution authority, validating targets, URL protocols (blocking `javascript:`, `data:`, `file:`), and stale DOM elements.
* **Independent Remote Validation & Secure Transport (Steps 15 & 16)**: Added recursive server-side payload validation that never trusts client metadata, paired with a secure transport client enforcing pre-serialization checks, HTTPS, replay protection, and zero credential/body logging.
* **Coordinator & SIH Showcase (Step 17)**: Orchestrated the end-to-end flow with high-resolution latency benchmarking, non-fingerprinting environment reporting, dynamic security auditing, and a reproducible 3-scenario demo runner.

---

## 4. Current Understanding

### End-to-End System Architecture

```text
[ USER TASK ] + [ RAW WEB PAGE / DOM / OCR ]
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ LOCAL TRUST BOUNDARY (Chrome Extension & @privacy-agent)   │
│                                                             │
│ 1. Perception & Detection (Steps 4–6, 10):                  │
│    - Multi-signal DOM & OCR text scan                       │
│    - Semantic input attribute inspection                    │
│    - Bounding box localization & fusion                     │
│                                                             │
│ 2. Context & Policy Engine (Steps 7–8):                     │
│    - Task intent classification                             │
│    - Relevance evaluation & confidence thresholds           │
│    - Decision mapping: REDACT, TOKENIZE, LOCAL_ONLY, ALLOW  │
│                                                             │
│ 3. Secure Local Privacy Vault (Step 9):                     │
│    - In-memory storage for LOCAL_ONLY secrets (TTL bound)   │
│    - Zero remote exposure (DENIED_REMOTE_DESTINATION)       │
│                                                             │
│ 4. Sanitized Context Builder (Step 11):                     │
│    - Strips <script>, <iframe>, event handlers, raw secrets │
│    - Injects opaque tokens (e.g., {{PII_TOKEN_EMAIL_abc123}})│
│    - Preserves spatial bounding boxes for visual layout     │
│                                                             │
│ 5. Secure Communication Client (Step 16):                   │
│    - Pre-serialization failsafe payload scan                │
│    - Dynamic auth header injection                          │
│    - HTTPS enforcement & UTF-8 size check                   │
└────────────────────────────┬────────────────────────────────┘
                             │ (Over HTTPS / Mock Transport)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ REMOTE REASONING BOUNDARY (services/reasoning-backend)      │
│                                                             │
│ 1. Recursive Payload Security Validator:                    │
│    - Content scan rejecting unmasked PII/DOM/scripts        │
│ 2. Reasoning Provider (MockTest / Remote LLM):              │
│    - Generates high-level Action Proposals only             │
│ 3. Response Validator:                                      │
│    - Enforces proposal schema & blocks script injection     │
└────────────────────────────┬────────────────────────────────┘
                             │ (Action Proposals)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ LOCAL ACTION EXECUTION (packages/privacy-core & extension) │
│                                                             │
│ 1. Browser Action Engine (Step 14 Authority):               │
│    - Validates target presence & stale target check         │
│    - Enforces protocol safety (blocks javascript:, data:)   │
│    - Authorizes local vault secret injection if authorized  │
│ 2. ActionRuntime (apps/extension):                          │
│    - Performs native DOM dispatch (click, input, scroll)    │
└─────────────────────────────────────────────────────────────┘
```

### Major Modules & Packages

1. [`packages/shared-types`](file:///Users/shahrukh/Desktop/sih/packages/shared-types):
   * [`src/privacy-contracts.js`](file:///Users/shahrukh/Desktop/sih/packages/shared-types/src/privacy-contracts.js): Immutable constants, enums, and data contracts (`POLICY_ACTIONS`, `TASK_INTENT_TYPES`, `SENSITIVITY_LEVELS`, `PROCESSING_DESTINATIONS`, `VAULT_ENTRY_STATES`, `WEBGPU_STATUS`, `BROWSER_ACTION_TYPES`, `SECURE_COMMUNICATION_STATUS`, `E2E_WORKFLOW_STATUS`).
2. [`packages/privacy-core`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core):
   * [`detection.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/detection.js), [`dom-semantics.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/dom-semantics.js), [`fusion.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/fusion.js): Multi-signal perception engine.
   * [`context-analyzer.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/context-analyzer.js): Task intent and entity relevance engine.
   * [`policy-engine.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/policy-engine.js): 4-action privacy policy decision engine.
   * [`privacy-vault.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/privacy-vault.js): In-memory temporary local vault.
   * [`visual-model-adapter.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/visual-model-adapter.js), [`onnx-runtime-adapter.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/onnx-runtime-adapter.js), [`webgpu-manager.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/webgpu-manager.js): Hardware-aware on-device visual perception and ML inference.
   * [`sanitized-context-builder.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/sanitized-context-builder.js): Safe representation transformer.
   * [`browser-action-engine.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/browser-action-engine.js): Local action validation and execution authority.
   * [`secure-communication-client.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/secure-communication-client.js): Secure transport boundary client.
   * [`browser-agent-coordinator.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/browser-agent-coordinator.js): Master pipeline orchestrator.
   * [`benchmark-utility.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/benchmark-utility.js), [`environment-reporter.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/environment-reporter.js), [`security-audit-utility.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/security-audit-utility.js): Operational and compliance tools.
3. [`services/reasoning-backend`](file:///Users/shahrukh/Desktop/sih/services/reasoning-backend):
   * [`reasoning-service.js`](file:///Users/shahrukh/Desktop/sih/services/reasoning-backend/src/reasoning-service.js), [`payload-validator.js`](file:///Users/shahrukh/Desktop/sih/services/reasoning-backend/src/payload-validator.js), [`response-validator.js`](file:///Users/shahrukh/Desktop/sih/services/reasoning-backend/src/response-validator.js): Independent remote reasoning boundary service.
4. [`apps/extension`](file:///Users/shahrukh/Desktop/sih/apps/extension):
   * Chrome MV3 extension popup UI and content scripts for browser-level metadata capture, PII scanning, OCR hook, and DOM action execution.

---

## 5. Work Completed So Far

* **287 Automated Tests Across 14 Test Suites**: 100% passing test suite exercising policy decisions, spatial localization, robust detection, context analysis, vault security, OCR, sanitized context generation, ONNX runtime, WebGPU acceleration, browser actions, remote reasoning, secure transport, and end-to-end pipelines.
* **17 Verification Scripts**: Full validation suite verifying all structural, contract, and pipeline invariants.
* **Full SIH Demonstration Runner**: [`scripts/run-sih-demo.mjs`](file:///Users/shahrukh/Desktop/sih/scripts/run-sih-demo.mjs) verifying:
  1. Non-sensitive product search.
  2. Sensitive payment form filling keeping credit card number strictly local in the vault while sending tokenized/redacted context remotely.
  3. Malicious page script injection rejection.
* **Deployment & Walkthrough Documentation**: [`DEPLOYMENT.md`](file:///Users/shahrukh/Desktop/sih/DEPLOYMENT.md) and [`DEMO_WALKTHROUGH.md`](file:///Users/shahrukh/Desktop/sih/DEMO_WALKTHROUGH.md).

---

## 6. Important Decisions

### Decision 1: Absolute Local Execution Authority for Browser Actions
* **Decision**: The remote reasoning service is strictly restricted to returning structured **action proposals**. The local `BrowserActionEngine` holds 100% authority to approve, deny, sanitize, or execute actions against the DOM.
* **Reason**: Preventing prompt injection attacks, malicious server responses, or hijacked AI models from executing arbitrary JavaScript or unauthorized actions in the user's browser session.
* **Alternatives Considered**: Direct remote command dispatch (e.g. sending raw executable JS strings or direct element click commands from the server). Rejected due to critical security risks.
* **Consequences**: Local engine performs target presence checks, stale target validation, protocol sanitization (blocking `javascript:`, `data:`, `file:`), and authorization enforcement.

### Decision 2: Two-Stage Fallback for WebGPU Hardware Acceleration
* **Decision**: WebGPU is only declared active if Stage 1 (browser `navigator.gpu` adapter & device acquisition) AND Stage 2 (ONNX WebGPU execution provider compatibility) both succeed. Otherwise, automatically fall back to WASM or CPU.
* **Reason**: Browser and GPU driver support varies significantly across client machines; hard dependencies on WebGPU cause runtime crashes on unsupported devices.
* **Alternatives Considered**: Static WebGPU assumption or crashing on initialization failure. Rejected.
* **Consequences**: High-performance hardware acceleration when available, with guaranteed reliable execution on any standard machine.

### Decision 3: In-Memory Only Ephemeral Privacy Vault
* **Decision**: Stored secrets (passwords, card numbers, OTPs) are held in an in-memory `Map` with strict TTL (default 5 minutes), purpose scoping, and capacity limits (100 entries). They are never written to `localStorage`, `IndexedDB`, or disk.
* **Reason**: Eliminates risk of persistent disk forensic recovery or cross-session credential leaks.
* **Alternatives Considered**: Browser extension `chrome.storage.local` with encryption. Deferred to keep MVP memory footprint isolated and strictly ephemeral.
* **Consequences**: Secrets naturally expire and wipe from memory if an action is delayed or cancelled.

### Decision 4: Pre-Serialization Failsafe in Secure Transport Client
* **Decision**: The `SecureCommunicationClient` invokes `validateRemotePayload()` *before* invoking `JSON.stringify()`.
* **Reason**: Ensures that even if an upstream bug in the sanitizer produces raw PII, the transport client fails closed and throws an error before data reaches the network layer.
* **Consequences**: Fail-closed boundary guarantees zero accidental transmission of unmasked PII.

### Decision 5: Non-Fingerprinting Capability Telemetry
* **Decision**: Telemetry and environment reports expose only generalized capability flags (e.g. `maxTextureDimension2D`, `supportedFeatures`) and omit GPU vendor strings, renderer names, hardware serial numbers, and OS user identifiers.
* **Reason**: Prevents device fingerprinting and user tracking across sessions.
* **Consequences**: Privacy-preserving auditability without violating user anonymity.

---

## 7. Problems Encountered

1. **Luhn Verification False Positives on Arbitrary Numbers**:
   * *Problem*: Simple digit matching flagged 16-digit order numbers or tracking numbers as credit cards.
   * *Investigation*: Checked digit patterns vs Luhn checksum algorithm.
2. **Stale DOM Targets in Dynamic Single Page Apps (SPAs)**:
   * *Problem*: As asynchronous SPA pages re-render, action targets proposed by remote reasoning could reference elements that no longer exist or changed positions.
3. **Typeless Root `package.json` Emitting Node Warnings**:
   * *Problem*: Root `package.json` lacks `"type": "module"`, causing Node.js to emit `[MODULE_TYPELESS_PACKAGE_JSON]` warnings when importing `.js` files in ESM mode from `services/reasoning-backend` or test fixtures.

---

## 8. Problems Solved

1. **Luhn Verified Credit Card Algorithm**:
   * *Solution*: Implemented `passesLuhn()` in [`packages/privacy-core/src/detection.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/detection.js) and [`apps/extension/src/content-pii.js`](file:///Users/shahrukh/Desktop/sih/apps/extension/src/content-pii.js) to filter out non-card number sequences.
2. **Target Resolution & Stale Target Protection**:
   * *Solution*: Created `resolveTarget()` in [`packages/privacy-core/src/browser-action-engine.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/browser-action-engine.js) with priority ordering (`TOKEN_REFERENCE` $\rightarrow$ `SEMANTIC_TARGET` $\rightarrow$ `DOM_ELEMENT` $\rightarrow$ `OCR_REGION`) and explicit stale target rejection (`DENIED_STALE_TARGET`).
3. **Pre-Serialization and Recursive Deep Inspection**:
   * *Solution*: Added recursive content inspection in [`services/reasoning-backend/src/payload-validator.js`](file:///Users/shahrukh/Desktop/sih/services/reasoning-backend/src/payload-validator.js) and pre-serialization checks in [`packages/privacy-core/src/secure-communication-client.js`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/src/secure-communication-client.js).

---

## 9. Abandoned Approaches

1. **Direct DOM Execution from Remote AI**:
   * *Abandoned*: Allowing the remote service to return raw executable JavaScript snippets or direct DOM selectors to be evaluated via `eval()`.
   * *Why Abandoned*: Severe security hazard (XSS vulnerability, remote code execution, prompt injection exploitation). Replaced with strict enum-based `BROWSER_ACTION_TYPES` validated locally.
2. **Trusting Client-Supplied `"SANITIZED"` Flag**:
   * *Abandoned*: Allowing the remote backend to skip validation if `status === "SANITIZED"`.
   * *Why Abandoned*: Violated zero-trust principles. If a client is compromised or buggy, raw PII could reach the backend model. Replaced with recursive deep payload inspection on both sides of the boundary.
3. **Persistent Local Storage for Vault Secrets**:
   * *Abandoned*: Writing vault secrets to `localStorage` or `IndexedDB`.
   * *Why Abandoned*: Risk of forensic credential theft on shared or compromised machines. Replaced with ephemeral in-memory storage with TTL expiration.

---

## 10. Important Discoveries

* **Spatial Geometry Enables Layout Understanding Without Raw Text**: Preserving bounding boxes (`bbox: { x, y, width, height }`) while replacing sensitive text with tokens allows VLM/LLM reasoning models to understand layout relationships (e.g., "the submit button below the email field") without seeing actual email addresses or passwords.
* **Multi-Signal Context Outperforms Regex Alone**: Combining input element attributes (`autocomplete="cc-number"`, `aria-label`, `<label>` associations) with regex catches obfuscated or split PII fields that pure text regex misses.
* **Transient Error Retry Classification**: Differentiating retryable errors (HTTP 408, 429, 500, 502, 503, 504) from non-retryable security errors (HTTP 400, 401, 403, 422, PII scan failure) prevents security violation loops and avoids re-sending invalid payloads.

---

## 11. Constraints

* **Node Runtime vs Browser Runtime**: Core packages are standard ESM. In Node.js, `navigator.gpu` and Chrome extension APIs are absent, requiring mock adapters during automated testing (`MOCK_TEST` provider).
* **Memory Limits**: Vault is limited to 100 entries; text sanitization enforces maximum node counts (1,000 nodes) and depth limits (32 levels) to prevent DOM traversal memory exhaustion.
* **Payload Size Limits**: Remote request payloads are strictly capped at 256 KB (`MAX_PAYLOAD_BYTES`), and transport byte size is capped at 512 KB (`MAX_REQUEST_SIZE_BYTES`).
* **Protocol Safety**: Navigation is restricted to `http:` and `https:`. Unsafe schemes (`javascript:`, `data:`, `file:`, `blob:`, `about:`) are rejected.

---

## 12. Current Known State

* **Core Engine**: Steps 1 through 17 are 100% implemented, verified, and passing 309 automated privacy tests.
* **Chrome Extension**: Manifest V3 extension in `apps/extension` with dynamic DOM perception (`InteractiveElementRegistry`), local PII masking, and multi-step Re-Act execution loop (`MAX_STEPS = 6`).
* **Reasoning Integrations**: Supports both Groq (`openai/gpt-oss-20b`) and OpenRouter models with automatic `.env` key injection and zero raw secrets over the wire.
* **Observability**: Live terminal log server (`npm run dev:logs`) streaming pipeline events in real time.
* **On-Device ML Training Pipeline**: `models/sih_training_pipeline.py` provides an end-to-end 5-stage pipeline to train YOLOv8 (visual PII) and ViT (context classification) and export to ONNX Runtime Web.

---

## 13. Historical Timeline

* **2026-08-28T10:36:47+05:30 (Commit `a88288b`)**:
  * Initial implementation through Step 11: Monorepo layout, PII detection, DOM semantics, OCR fusion, Context Analyzer, Privacy Policy Engine, Secure Local Privacy Vault, Visual Model Adapter, and Sanitized Context Builder.
* **2026-08-28T20:23:10+05:30 (Commit `3451b0b`)**:
  * Completed Steps 12 through 17: ONNX Runtime Web adapter, WebGPU manager with fallback, Browser Action Engine, Remote Reasoning Backend service, Secure Communication Client, End-to-End Coordinator, Latency Benchmark, Security Audit, Synthetic Datasets, Deployment Guide, and SIH Demo Walkthrough. 287 tests fully passing.
* **2026-08-29T23:25:00+05:30**:
  * Free Vision / Agent Model Integration: Implemented `ModelProvider` base class and `OpenRouterProvider` adapter for `google/gemma-4-26b-a4b`. Connected to `SecureCommunicationClient` and Chrome extension popup with runtime key storage and strict policy enforcement. 309 tests passing.
* **2026-08-30T18:40:00+05:30**:
  * Dynamic DOM-Based Browser Actions & Live Terminal Streaming: Implemented generic element discovery (`el_1`, `el_2`, bboxes) and WebSocket log relay (`scripts/extension-log-server.mjs`). Performed end-to-end real Chrome browser testing across Test Cases A through F.
* **2026-08-30-31**:
  * Multi-Step Re-Act Execution & ML Training Pipeline:
    1. Implemented iterative perception-action loop (`MAX_STEPS = 6`) with page settlement pauses in `apps/extension/src/popup.js`.
    2. Implemented URL auto-navigation from internal tabs (`chrome://newtab`, `about:blank`).
    3. Enhanced checkbox, radio button, and eCommerce filter perception (`.a-checkbox-label`, `li[id^="p_"] a`).
    4. Added search query keyword extraction and "Add to Cart" action disambiguation.
    5. Created 5-stage Machine Learning training pipeline (`models/sih_training_pipeline.py`) for YOLOv8 and ViT on Mac Metal / CUDA / CPU.
    6. Updated all project documentation (`AGENTS.md`, `README.md`, `to-do.md`, `progress.md`, `memory.md`). All 309 tests passing.

