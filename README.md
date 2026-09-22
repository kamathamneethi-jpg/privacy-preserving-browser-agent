# Privacy-Preserving Autonomous Browser Agent

> **Smart India Hackathon (SIH 2026)**  
> A task-aware, on-device privacy filter and autonomous browser agent architecture that enables natural-language web task automation while keeping sensitive personal information, credentials, and visual pixels strictly protected on the user's local device.

---

## 1. Project Overview

Autonomous browser agents typically send complete DOM trees and raw webpage screenshots to cloud-hosted multimodal AI models to determine navigation and interaction steps. This design introduces severe privacy risks: personal identity numbers, email addresses, contact phone numbers, session tokens, passwords, and payment card details are routinely transmitted across external networks.

This project introduces a **100% On-Device Privacy Boundary** for browser automation. Before any data leaves the client browser, an on-device perception and policy engine analyzes the page context, determines task relevance, and strictly sanitizes text, visual pixels, and remote payloads. Local browser actions are executed with authoritative local control, ensuring that external AI models receive only the abstract context necessary to deduce the user's intent.

---

## 2. Core Idea: Task-Aware Data Minimization

The system enforces **Task-Aware Data Minimization**:
> *Remote AI models act as reasoning advisors and receive only the minimum information required for the task. High-security credentials and raw personal data remain exclusively inside the local browser runtime.*

### The Four Deterministic Privacy Outcomes

The on-device **`PolicyEngine`** evaluates contextual signals (semantic role, task necessity, relevance, and sensitivity) and assigns one of four authoritative decisions:

| Decision | Meaning | Representation in Remote Payload | Representation in DOM | Screenshot Visual Masking |
| :--- | :--- | :--- | :--- | :--- |
| **`ALLOW`** | Safe public information needed for task comprehension. | Raw safe value (e.g. `"Running Shoes"`, `"$199.99"`) | Unmodified | **Clear (Unmasked)** |
| **`TOKENIZE`** | Sensitive data required for task reasoning where an abstract reference suffices. | Opaque Token (e.g. `{{EMAIL_1}}`, `{{PHONE_1}}`) | Replaced with token | **Masked (Solid Blackout)** |
| **`REDACT`** | Sensitive data unnecessary for the task or incidental page data. | `[REDACTED]` marker | Replaced with `[REDACTED]` | **Masked (Solid Blackout)** |
| **`LOCAL_ONLY`** | Critical security secrets (passwords, OTP/2FA codes, payment credentials). | **EXCLUDED** (Omitted entirely from payload) | Protected locally `[LOCAL_ONLY_PROTECTED]` | **Masked (Solid Blackout)** |

---

## 3. System Architecture

```text
User Task
    ↓
GoalParser ──► TaskPlanner
    ↓
Browser Observation / Perception (InteractiveElementRegistry: el_1, el_2, ...)
    ↓
ContextAnalyzer (Semantic Roles, Task Relevance, Operational Necessity)
    ↓
PolicyEngine [AUTHORITATIVE DECISION]
    ↓
┌──────────────┬──────────────┬──────────────┐
│     DOM      │  Screenshot  │    Remote    │
│  Sanitizer   │  Sanitizer   │   Context    │
└──────────────┴──────────────┴──────────────┘
    ↓
PrivacyVault (Temporary Local In-Memory Storage)
    ↓
BrowserActionEngine (Local Execution Authority & safeClick CSP Defense)
```

### End-to-End Privacy Flow
1. **Perception**: Dynamic DOM discovery assigns opaque element IDs (`el_1`, `el_2`, ...) and bounding boxes. On-device detectors (regex, DOM semantics, OCR, YOLO, GLiNER) identify candidate entities.
2. **Context Analysis**: The `ContextAnalyzer` evaluates the relationship between detected data and user intent, deriving semantic roles (`ACCOUNT_IDENTIFIER`, `RECIPIENT`, `AUTH_SECRET`, etc.) and task necessity.
3. **Authoritative Policy Decision**: The `PolicyEngine` issues an immutable decision (`ALLOW`, `TOKENIZE`, `REDACT`, `LOCAL_ONLY`).
4. **Unified Enforcement**:
   - **DOM Sanitizer**: Replaces sensitive nodes with abstract tokens or redaction markers.
   - **Screenshot Sanitizer**: Solid blackouts are applied to bounding boxes on an in-memory canvas before visual export.
   - **Remote Payload Builder**: Formats the JSON payload, replacing tokenized fields and completely excluding `LOCAL_ONLY` secrets.
5. **Local Execution**: The remote model proposes an action (e.g. `CLICK el_5` or `TYPE el_1 "{{EMAIL_1}}"`). The local `BrowserActionEngine` resolves the token from `PrivacyVault` and executes the DOM mutation using `safeClick`.

---

## 4. Key Privacy Mechanisms

### A. Tokenization & Local Privacy Vault
When a field is relevant to reasoning but sensitive (e.g. recipient email address), the system generates an opaque token (e.g. `{{EMAIL_1}}`). The raw value is stored in an isolated, in-memory `PrivacyVault` with TTL expiration. Remote reasoning models only observe and manipulate the token.

### B. Dual-Modality Visual Screenshot Privacy
Multimodal vision models receive screenshots where all bounding boxes corresponding to `TOKENIZE`, `REDACT`, and `LOCAL_ONLY` data are overwritten with solid black rectangles on-device. Raw screenshot bitmaps are never transmitted.

### C. Telemetry & Observability Boundary
All logging, SSE event streams, and error boundaries pass through `telemetry-sanitizer.js`. The tested telemetry paths are audited and protected against evaluated raw-value, credential, and vault-mapping leakage.

### D. Reviewer Transparency Layer
The extension popup provides a live **Privacy Transparency Panel** rendering reviewer-friendly badges:
- `🟢 ALLOW`: Public / Safe context.
- `🔴 TOKENIZE`: Abstract tokenized reference.
- `⚫ REDACT`: Unnecessary sensitive data masked.
- `🔒 LOCAL_ONLY`: Critical credential isolated to local execution.

> 💡 **Important Architectural Note**: The visual colors are for presentation only. They consume the actual `PolicyDecision` generated on-device by the `PolicyEngine` and do not define or alter privacy logic.

### E. Zero Website-Specific Hardcoding
The privacy model operates strictly on semantic roles, accessible labels, input types, and task necessity. It contains zero hardcoded selector lists, task-matching rules, or website-specific branches (e.g. Amazon, Google, Flipkart).

---

## 5. Repository Layout

```text
privacy-preserving-browser-agent/
├── apps/
│   └── extension/             # Chrome Extension (Manifest V3 popup, DOM perception, action runtime)
│       ├── manifest.json      # MV3 extension manifest
│       ├── popup.html         # User popup UI with live transparency panel
│       └── src/
│           ├── popup.js       # Re-Act agent loop, model dispatcher, transparency renderer
│           └── action-runtime.js # Authoritative local DOM executor with safeClick
├── packages/
│   ├── privacy-core/          # Core on-device privacy, perception, and action library
│   │   └── src/
│   │       ├── goal-parser.js                # Natural-language intent & constraint extractor
│   │       ├── task-planner.js               # Multi-step task planner
│   │       ├── interactive-element-registry.js# Dynamic DOM perception & abstract IDs (el_1, el_2)
│   │       ├── context-analyzer.js           # Semantic role & necessity analysis
│   │       ├── policy-engine.js              # Authoritative 4-way decision framework
│   │       ├── privacy-vault.js              # In-memory isolated local vault
│   │       ├── dom-redactor.js               # DOM text masking & token injection
│   │       ├── image-redactor.js             # Visual bounding box blackout engine
│   │       ├── sanitized-context-builder.js  # Outbound payload builder
│   │       ├── telemetry-sanitizer.js        # Logging & audit stream scrubber
│   │       └── browser-action-engine.js      # Authoritative local execution engine
│   └── shared-types/          # Contracts, schemas, and necessity/role enums
├── services/
│   └── reasoning-backend/     # Remote reasoning adapter and payload firewall
├── models/
│   └── sih_training_pipeline.py # 5-stage ML training pipeline (YOLOv8 + ViT + ONNX)
├── scripts/
│   ├── build-extension.mjs    # ESBuild extension bundler
│   ├── extension-log-server.mjs # Observability backend & SSE dashboard on port 8765
│   └── run-sih-demo.mjs       # Automated 3-scenario demo runner
├── tests/
│   ├── fixtures/
│   │   └── controlled-privacy-demo.html # Generic mixed-content test fixture
│   └── *.test.mjs             # 14 automated test suites (570 tests)
└── docs/                      # Architectural documentation and guides
    ├── architecture.md        # Detailed trust boundary and component map
    ├── privacy-model.md       # Decision framework, semantic roles, and necessity levels
    ├── data-flow.md           # End-to-end data lifecycle across representations
    ├── reviewer-demo.md       # Step-by-step evaluator guide & presentation script
    ├── testing.md             # Test organization and verified test execution output
    └── limitations.md         # Documented engineering boundaries
```

---

## 6. Installation & Setup

### Prerequisites
- **Node.js**: `v20.0.0` or higher
- **Google Chrome**: Version 118+ (Manifest V3 support)

### Installation
Clone the repository and install root dependencies:
```bash
npm install
```

### Build Chrome Extension
Bundle the extension scripts into `apps/extension/dist/`:
```bash
node scripts/build-extension.mjs
```

---

## 7. Running & Testing

### 1. Load Extension in Google Chrome
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle **Developer mode** ON (top right).
3. Click **Load unpacked** and select the folder:
   `apps/extension`
4. Pin the extension to your Chrome toolbar.
5. To reload after making changes, click the built-in **`🔄 Reload`** button in the popup header.

### 2. Run Automated Regression Test Suite
Run all automated test suites:
```bash
node --test tests/*.test.mjs
```

**Verified Test Status**:
```text
# tests: 570
# suites: 14
# pass:  570
# fail:  0
# duration: ~6.7s
```

### 3. Launch Live Observability Dashboard (Optional)
```bash
node scripts/extension-log-server.mjs
```
- Dashboard UI: `http://127.0.0.1:8765`
- Real-time SSE Stream: `http://127.0.0.1:8765/api/events/stream`

---

## 8. Reviewer Demonstration Walkthrough

For evaluating judges and technical reviewers:

1. **Open Controlled Fixture**: Open [`tests/fixtures/controlled-privacy-demo.html`](tests/fixtures/controlled-privacy-demo.html) in a Chrome tab. This is a generic test portal containing public product info, personal email/phone, and account credentials.
2. **Scan Page Locally**: Open the extension popup and click **"🔍 Scan page locally for PII"**.
3. **Inspect Privacy Decisions**:
   - Product title and price receive `🟢 ALLOW`.
   - Recipient email receives `🔴 TOKENIZE`.
   - Incidental customer phone receives `⚫ REDACT`.
   - Account password and 2FA OTP receive `🔒 LOCAL_ONLY`.
4. **Inspect Redacted DOM**: Click **"View Redacted DOM"** to verify that credentials are protected (`[LOCAL_ONLY_PROTECTED]`) and elements have opaque IDs (`el_1`, `el_2`, ...).
5. **Run Agent Task**: Enter `change the email to alex@gmail.com and click on confirm Order` and run the agent to observe local form update and safe click execution.

*For complete evaluation scripts and guidelines, consult [`docs/reviewer-demo.md`](docs/reviewer-demo.md).*

---

## 9. Security & Boundary Model

- **Local Execution Authority**: Only the local extension runtime has authority to execute DOM changes.
- **Remote Reasoning Boundary**: Remote LLMs act as advisory planning agents receiving only sanitized context.
- **Privacy Vault**: Ephemeral in-memory storage with zero remote egress APIs.
- **Telemetry Boundary**: Audited and scrubbed of raw user tasks and secrets.

*(The tested telemetry and boundary paths were audited and protected against evaluated raw-value leakage cases. As with any software system, security is maintained through defense-in-depth rather than claims of absolute impossibility).*

---

## 10. Known Limitations

1. **Generic Natural-Language Action Planning**: Highly ambiguous or non-standard conversational phrasing without standard prepositional cues (`to`, `with`, `as`) may occasionally require manual form completion, though privacy boundaries remain strictly enforced.
2. **High-Entropy Unstructured Secrets**: Arbitrary random secret strings appearing as plain unstructured text in generic containers without standard semantic attributes or prefixes may not be classified as secrets.
3. **Active Tab Focus**: Certain keyboard and focus-dependent DOM events require the browser tab to remain focused during execution.

*For full engineering details, see [`docs/limitations.md`](docs/limitations.md).*

---

## 11. Future Enhancements

- **Direct In-Extension ONNX Model Packaging**: Package quantized `yolo_pii.onnx` and `vit_context.onnx` directly inside the extension bundle for offline visual neural inference.
- **Multi-Tab Orchestration**: Extend planner coordination across concurrent browser tabs.
- **Voice Agent Interface**: Integrate Web Speech API for voice-driven task initiation.
