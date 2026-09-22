# Testing & Verification Guide

> 📌 **Reference**: Automated test suites are located in [`../tests/`](../tests/).

---

## 1. Test Suite Overview & Organization

The repository contains a comprehensive automated regression suite using Node.js native test runner (`node:test` and `node:assert/strict`). Tests require zero external cloud dependencies or API keys.

```text
tests/
├── phase1-privacy-contracts.test.mjs       # Privacy schemas, reason codes, necessity levels
├── phase2-context-analyzer.test.mjs        # Semantic roles, task relevance, evidence codes
├── phase3-policy-engine.test.mjs           # Authoritative 4-way decision framework
├── phase4-unified-sanitization.test.mjs    # Cross-representation DOM & visual redaction parity
├── phase5-telemetry-safety.test.mjs        # Telemetry scrubbing & error boundary audits
├── phase6-end-to-end-privacy-demo.test.mjs # 7-class mixed content verification matrix
├── phase7-runtime-transparency.test.mjs    # Extension transparency UI & runtime integration
├── phase7-generic-form-execution.test.mjs  # Form mutation, confirmation clicks, overwrite rules
├── qwen-vlm-agent-architecture.test.mjs    # Working memory, dynamic replan, action validator, loops
├── generic-agent-architecture.test.mjs     # Element discovery, stale-target recovery, CSP checks
├── compound-intent-resolution.test.mjs     # Compound tasks & generic UI action verbs
├── generalized-intent-architecture.test.mjs# Candidate roles, ordinals, entity constraints
├── visual-screenshot-coordinates.test.mjs  # DPR coordinate scaling & visual bbox blackouts
├── webgpu-acceleration.test.mjs            # Hardware detection & WASM fallback tests
└── yolo-visual-redaction.test.mjs          # YOLO visual PII detection & confidence filtering
```

---

## 2. Test Execution & Current Results

### Run All Test Suites
```bash
node --test tests/*.test.mjs
```

### Verified Test Results
```text
✔ Phase 1: Privacy Contracts & Policy Shapes (8 tests)
✔ Phase 2: Context Analyzer & Semantic Roles (8 tests)
✔ Phase 3: Policy Engine Generalization & Deterministic Decisions (28 tests)
✔ Phase 4: Unified Sanitization Across Representations (18 tests)
✔ Phase 5: Telemetry Safety & Observability Invariants (16 tests)
✔ Phase 6: End-to-End Privacy Demo & Transparency Badges (12 tests)
✔ Phase 7: Runtime Privacy Transparency (10 tests)
✔ Phase 7: Generic Form Modification & Confirmation Execution (8 tests)
✔ Qwen VLM Agent Architecture & Host Gatekeeper (13 tests)
✔ Generic Agent Architecture & Stale Target Recovery (25 tests)
✔ Compound Intent Resolution (9 tests)
✔ Generalized Intent & Prepositional Roles (28 tests)
✔ Visual Screenshot Coordinate Scaling & Redaction (8 tests)
✔ WebGPU Hardware Acceleration & Two-Stage Validation (28 tests)
✔ YOLO Visual Bounding Box Redaction (4 tests)

--------------------------------------------------------------------------------
# tests: 583
# suites: 14
# pass:  583
# fail:  0
# cancelled: 0
# skipped: 0
# duration: ~6.8s
--------------------------------------------------------------------------------
```

---

## 3. Key Verification Categories

### A. Privacy Contract & Policy Invariants
- Tests in [`tests/phase1-privacy-contracts.test.mjs`](../tests/phase1-privacy-contracts.test.mjs) and [`tests/phase3-policy-engine.test.mjs`](../tests/phase3-policy-engine.test.mjs) verify the immutability of decision shapes, reason codes, necessity levels, and the single-authority status of `PolicyEngine`.

### B. Cross-Representation Parity & Unified Sanitization
- Tests in [`tests/phase4-unified-sanitization.test.mjs`](../tests/phase4-unified-sanitization.test.mjs) verify that the same privacy decision is applied identically across DOM text, visual screenshot bounding boxes, and outbound JSON payloads.

### C. Adversarial Sentinel Leak Checks
- Synthetic canary tokens and unique sentinel strings (e.g. `PHASE6_SECRET_SENTINEL_xyz`) are injected into DOM nodes and form inputs.
- The test suite validates that:
  1. Sentinels never appear in outbound remote payload strings.
  2. Sentinels never appear in telemetry event payloads.
  3. Sentinels are completely masked on visual image canvases.

### D. Hardcoding Audits
- Automated AST and regex static inspection tests in [`tests/phase7-generic-form-execution.test.mjs`](../tests/phase7-generic-form-execution.test.mjs) scan source files to guarantee:
  - Zero hardcoded website domains (e.g. Amazon, Google, Flipkart) in action decision branches.
  - Zero exact demo-task prompt string matching.
  - Zero selector-specific hardcoded mappings (`#btn-submit-order`, `#recipient-email`).

### E. VLM Agent Architecture & Host Security Gatekeeping
- Tests in [`tests/qwen-vlm-agent-architecture.test.mjs`](../tests/qwen-vlm-agent-architecture.test.mjs) verify:
  1. Extension working memory (`AgentState`) initialization, task updates, and dynamic replanning (`replan: true`).
  2. Action validator rejects unapproved action types, non-existent DOM target elements, and dangerous navigation schemes (`javascript:`, `file:`).
  3. Safe on-device resolution of `PrivacyVault` tokens during `TYPE` actions.
  4. 3x repeated action stagnation loop detection (`detectExecutionLoop`).
  5. Strict on-device security assertion throwing exceptions if any raw secret is present in outbound VLM message strings.
  6. Compliance of autonomous decision server payloads with Qwen VLM response schemas.
