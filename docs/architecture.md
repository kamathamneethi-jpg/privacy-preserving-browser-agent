# System Architecture & Trust Boundary

> 📌 **Reference**: For master invariants, consult [`../AGENTS.md`](../AGENTS.md) and [`../to-do.md`](../to-do.md).

---

## 1. Architectural Overview

The **Privacy-Preserving Autonomous Browser Agent** enforces a strict separation between **local browser execution** and **remote AI reasoning**. Autonomous browser automation typically requires sending full DOM trees and screenshots to external multimodal LLMs, which leaks raw Personally Identifiable Information (PII), credentials, session tokens, and financial data.

This architecture introduces an on-device privacy filter that inspects, analyzes, and sanitizes all page context before any data crosses the external network boundary.

```text
                                  LOCAL CLIENT BROWSER
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                         │
│  User Task ──► GoalParser ──► TaskPlanner                                               │
│                     │                                                                   │
│                     ▼                                                                   │
│  Live Webpage DOM ──► Dynamic Perception (InteractiveElementRegistry: el_1, el_2, ...)  │
│          │                                                                              │
│          ├──────────► On-Device Detection (content-pii.js, GLiNER, YOLO, OCR)           │
│          │                               │                                              │
│          │                               ▼                                              │
│          │                 ContextAnalyzer (context-analyzer.js)                        │
│          │                               │ (Role, Necessity, Relevance)                 │
│          │                               ▼                                              │
│          │                 PolicyEngine (policy-engine.js) [AUTHORITATIVE DECISION]     │
│          │                 ├── ALLOW                                                    │
│          │                 ├── TOKENIZE ──► PrivacyVault (privacy-vault.js)             │
│          │                 ├── REDACT                                                   │
│          │                 └── LOCAL_ONLY ──► PrivacyVault (Critical Secrets)           │
│          │                                                                              │
│          ▼                                                                              │
│  MultimodalVisionAgent & Sanitizers                                                     │
│  ├── DOM Sanitizer: Text masked or replaced with tokens                                 │
│  ├── Screenshot Sanitizer: On-device visual bounding-box solid redaction               │
│  └── Telemetry Sanitizer: Audited logging stream (telemetry-sanitizer.js)               │
│                                                                                         │
└──────────────────────────────────────────┬──────────────────────────────────────────────┘
                                           │ (Sanitized Egress: Tokens, Redacted Image, Opaque IDs)
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           REMOTE MODEL REASONING BOUNDARY                               │
│                                                                                         │
│  External Reasoning Models (Hugging Face / OpenRouter / Groq / Local Heuristic)          │
│  • Consumes: Redacted Screenshot + Sanitized Structural DOM + Abstract IDs (el_1, el_2) │
│  • Emits: Abstract Action Intent (e.g. CLICK el_5, TYPE el_1 "{{EMAIL_1}}")             │
│  • Has ZERO access to raw PII, passwords, OTPs, or Privacy Vault storage                │
│                                                                                         │
└──────────────────────────────────────────┬──────────────────────────────────────────────┘
                                           │ (Abstract Action Intent Only)
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               LOCAL EXECUTION AUTHORITY                                 │
│                                                                                         │
│  BrowserActionEngine (browser-action-engine.js)                                         │
│  • Validates target existence and DOM freshness                                         │
│  • Injects real vault values locally if authorized for action execution                 │
│                                                                                         │
│  ActionRuntime (action-runtime.js) & DomDriver (dom-driver.js)                          │
│  • safeClick: Disarms javascript: pseudo-protocols to eliminate MV3 CSP errors          │
│  • Executes authoritative browser mutations: CLICK, TYPE, CHECK, SELECT, PRESS_KEY      │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Components & Responsibilities

| Component | Location | Primary Responsibility |
| :--- | :--- | :--- |
| **GoalParser** | [`packages/privacy-core/src/goal-parser.js`](../packages/privacy-core/src/goal-parser.js) | Parses natural-language user instructions into structured goals, candidate roles, constraints, and required operations. |
| **TaskPlanner** | [`packages/privacy-core/src/task-planner.js`](../packages/privacy-core/src/task-planner.js) | Decomposes structured goals into multi-step executable sub-tasks (`search`, `filter`, `fill_form`, `submit_form`). |
| **Perception Layer** | [`packages/privacy-core/src/interactive-element-registry.js`](../packages/privacy-core/src/interactive-element-registry.js) | Discovers interactive DOM nodes dynamically, assigning abstract element IDs (`el_1`, `el_2`) and spatial coordinates. |
| **ContextAnalyzer** | [`packages/privacy-core/src/context-analyzer.js`](../packages/privacy-core/src/context-analyzer.js) | Evaluates contextual signals: semantic role, task relevance, operational necessity, and sensitivity. |
| **PolicyEngine** | [`packages/privacy-core/src/policy-engine.js`](../packages/privacy-core/src/policy-engine.js) | **Single authoritative privacy decision-maker**. Emits deterministic decisions (`ALLOW`, `TOKENIZE`, `REDACT`, `LOCAL_ONLY`). |
| **PrivacyVault** | [`packages/privacy-core/src/privacy-vault.js`](../packages/privacy-core/src/privacy-vault.js) | Temporary in-memory vault for token-to-secret mappings. Strictly local; completely inaccessible to remote reasoning. |
| **SanitizedContextBuilder** | [`packages/privacy-core/src/sanitized-context-builder.js`](../packages/privacy-core/src/sanitized-context-builder.js) | Constructs sanitized DOM context for outbound payloads, replacing sensitive text with tokens or redaction markers. |
| **ImageRedactor** | [`packages/privacy-core/src/image-redactor.js`](../packages/privacy-core/src/image-redactor.js) | Masks sensitive visual bounding boxes on-device before screenshots leave the client. |
| **TelemetrySanitizer** | [`packages/privacy-core/src/telemetry-sanitizer.js`](../packages/privacy-core/src/telemetry-sanitizer.js) | Scrubs raw user tasks, credentials, and vault internals from logging and observability channels. |
| **BrowserActionEngine** | [`packages/privacy-core/src/browser-action-engine.js`](../packages/privacy-core/src/browser-action-engine.js) | **Sole local execution authority**. Validates proposed actions and resolves local vault tokens before DOM mutation. |
| **DomDriver & ActionRuntime** | [`packages/privacy-core/src/dom-driver.js`](../packages/privacy-core/src/dom-driver.js), [`apps/extension/src/action-runtime.js`](../apps/extension/src/action-runtime.js) | Executes authorized actions in the live DOM. Includes `safeClick` CSP mitigation. |
| **Extension UI & Transparency** | [`apps/extension/src/popup.js`](../apps/extension/src/popup.js), [`apps/extension/popup.html`](../apps/extension/popup.html) | User interface rendering live task execution, model selection, and the runtime privacy transparency panel. |

---

## 3. Trust Boundaries & Invariants

### Invariant 1: Single Policy Decision Authority
All outbound data channels (DOM serialization, visual screenshots, remote payloads, and telemetry) consume decisions produced exclusively by the **`PolicyEngine`**. No subsystem creates parallel or conflicting privacy policies.

### Invariant 2: Local Execution Authority
Remote AI models act strictly as reasoning advisors proposing abstract element actions (e.g. `CLICK el_5`). The **`BrowserActionEngine`** running in the local browser extension evaluates validity, checks target connectivity, and retains sole authority to execute DOM changes.

### Invariant 3: Zero Remote Access to PrivacyVault
The **`PrivacyVault`** exists purely in client memory. Tokens (e.g. `{{EMAIL_1}}`) are resolved back to real values only at the moment of local DOM action execution. Remote reasoning engines never receive access to vault contents or token mapping dictionaries.

### Invariant 4: Dual-Modality Redaction Parity
A sensitive entity classified as `TOKENIZE`, `REDACT`, or `LOCAL_ONLY` is protected in **both** text and visual modalities. When an image screenshot is captured, the corresponding visual bounding box is blacked out on-device before transmission.

### Invariant 5: CSP-Safe Action Execution
Clicking elements with `javascript:` pseudo-protocols (e.g. `<a href="javascript:void(0)">`) in Chrome Manifest V3 can trigger CSP violations. The `safeClick` routine disarms pseudo-protocols temporarily, dispatches native DOM events, and restores attributes in a `finally` block.

---

## 4. Hardware & Acceleration Architecture

- **WebGPU Manager** ([`packages/privacy-core/src/webgpu-manager.js`](../packages/privacy-core/src/webgpu-manager.js)): Implements two-stage hardware detection (browser API availability + ONNX Runtime provider compatibility) to accelerate on-device neural models with graceful fallback to WASM or CPU.
- **Privacy Safeguard**: Capability reporting exposes only coarse capability tiers (`high-performance` vs `fallback`) without leaking hardware vendor strings or GPU fingerprints.
