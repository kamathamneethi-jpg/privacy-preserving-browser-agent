# AGENTS.md — Master Guide & Architectural Context

> 🚨 **MANDATORY INSTRUCTION FOR ALL INCOMING AI AGENTS & DEVELOPERS** 🚨:
> In **EVERY** new conversation, session, or task, you **MUST** read and review the `.md` documentation files **FIRST** before analyzing, modifying, or executing any code in this repository.
> Follow the exact reading sequence in [Section 2: Reading Order](#2-what-to-read--check-first-mandatory-reading-order) below.

---

## 1. Project Overview & Mission

This project is a **Privacy-Preserving Autonomous Browser Agent** built for **Smart India Hackathon (SIH 2026)**.

The system empowers users to execute complex, natural language automation tasks across any website (e.g. *"Search for white running shoes under 7k on Amazon, filter by size, and select the first item"* or *"Fill out this registration form safely"*), while strictly enforcing a **100% On-Device Privacy Boundary**.

### Core Privacy Invariants
1. **Zero Raw Secrets Over the Wire**: Raw passwords, credit card numbers (Luhn-validated), OTPs, personal identity numbers, and raw PII **NEVER** leave the client browser.
2. **Zero Screenshot / Pixel Leakage**: The agent does **NOT** upload raw screenshots to remote LLMs. All visual perception and PII detection happen on-device. When multimodal vision is used, sensitive regions are blacked out/redacted on-device before transmission.
3. **Abstract Element IDs**: External reasoning models receive only sanitized, structural DOM element metadata with opaque IDs (`el_1`, `el_2`, `el_3`) and bounding boxes.
4. **Local Execution Authority**: Only the local extension runtime has the authority to execute browser actions (`CLICK`, `TYPE`, `CHECK`, `SELECT`, `PRESS_KEY`, `SUBMIT`). The remote model merely proposes abstract intent.
5. **CSP-Safe Action Runtime**: Browser actions disarm `javascript:` pseudo-protocols (e.g. `javascript:void(0)` links on Amazon) during clicks, preventing Chrome Manifest V3 Content Security Policy navigation violations.

---

## 2. What to Read & Check First (Mandatory Reading Order)

When starting work or opening any new conversation on this repository, follow this exact sequence:

1. **[`AGENTS.md`](AGENTS.md)** *(this file)*: Architecture, rules, reading order, and active conventions.
2. **[`to-do.md`](to-do.md)**: Current completion status, open items, and task priorities.
3. **[`progress.md`](progress.md)**: Complete chronological changelog of implemented features.
4. **[`DEMO_WALKTHROUGH.md`](DEMO_WALKTHROUGH.md)**: Step-by-step verification flows and test scenarios.
5. **[`README.md`](README.md)**: High-level project summary and quickstart guide.
6. **[`packages/privacy-core/`](packages/privacy-core/)**:
   - `src/interactive-element-registry.js`: Dynamic DOM perception & element discovery (`el_1`, `el_2`, labels, bboxes, filter facets).
   - `src/multimodal-vision-agent.js`: Dual-modality transmission (Redacted Screenshot + Sanitized DOM).
   - `src/dom-driver.js`: CSP-safe DOM action executor with `safeClickElement`.
   - `src/secure-communication-client.js`: Strict payload validation & remote boundary firewall.
   - `src/browser-agent-coordinator.js`: End-to-end task orchestration engine.
7. **[`apps/extension/src/`](apps/extension/src/)**:
   - `popup.js`: Extension UI, multi-step Re-Act agent loop (`MAX_STEPS = 6`), model dispatching, auto-navigation, and reload listener.
   - `action-runtime.js`: Content script executing authoritative DOM actions with `safeClick`.
   - `content-pii.js`: Local DOM PII scanner and highlighter.
8. **[`scripts/extension-log-server.mjs`](scripts/extension-log-server.mjs)**: Real-time Observability Backend & Live Telemetry Dashboard on port `8765`.
9. **[`models/sih_training_pipeline.py`](models/sih_training_pipeline.py)**: On-device ML pipeline (YOLOv8 for visual PII & ViT for context classification).

---

## 3. Key Architecture & File Map

```text
privacy-preserving-browser-agent/
├── apps/
│   └── extension/                    # Chrome Extension (Manifest V3)
│       ├── manifest.json             # Extension manifest (MV3, scripting, storage, all_urls)
│       ├── popup.html                # User popup UI with live transmission card & reload button
│       ├── dist/                     # Generated bundled extension files (load unpacked in Chrome)
│       └── src/
│           ├── popup.js              # Multi-step Re-Act loop, vision dispatch, dashboard links
│           ├── action-runtime.js     # Authoritative DOM action executor (with CSP-safe safeClick)
│           ├── content-pii.js        # On-device DOM PII scanner & highlighter
│           └── content-metadata.js   # Safe page metadata extractor
├── packages/
│   ├── privacy-core/                 # Core privacy & perception library
│   │   └── src/
│   │       ├── multimodal-vision-agent.js      # Dual-modality screenshot + DOM coordinator
│   │       ├── interactive-element-registry.js # Dynamic DOM scanner & element serializer
│   │       ├── dom-driver.js                  # CSP-safe DOM actions with safeClickElement
│   │       ├── secure-communication-client.js  # Zero-leakage payload transport
│   │       ├── privacy-policy-engine.js        # Redact/Tokenize/Protect decisions
│   │       ├── privacy-vault.js                # In-memory temporary isolated vault
│   │       ├── visual-model-adapter.js         # Hardware-aware ONNX Runtime adapter
│   │       └── webgpu-manager.js               # WebGPU acceleration with WASM fallback
│   └── shared-types/                 # Strict contracts and schemas
├── services/
│   └── reasoning-backend/            # Remote reasoning adapter and payload firewall
├── models/
│   └── sih_training_pipeline.py      # 5-stage ML training pipeline (YOLOv8 + ViT + ONNX)
├── scripts/
│   ├── build-extension.mjs           # ESBuild bundler injecting .env variables into dist/
│   ├── extension-log-server.mjs      # Live Observability Backend & SSE Dashboard on port 8765
│   └── run-sih-demo.mjs              # 3-scenario automated demo runner
└── tests/                            # 19+ automated privacy, DOM, and model test suites
```

---

## 4. Key Workflows & Commands

### 1. Build Chrome Extension
```bash
node scripts/build-extension.mjs
```
Generates production bundle in `apps/extension/dist/`.

### 2. Start Live Observability Server & Telemetry Dashboard
```bash
node scripts/extension-log-server.mjs
```
- Dashboard UI: `http://127.0.0.1:8765`
- Real-time SSE Stream: `http://127.0.0.1:8765/api/events/stream`
- Ingestion API: `http://127.0.0.1:8765/api/events`
- Local Agent Reasoning API: `http://127.0.0.1:8765/api/agent/reason`

### 3. Run Automated Unit & Privacy Tests
```bash
node --test tests/generic-dom-actions.test.mjs tests/observability-backend.test.mjs tests/content-pii-scan.test.mjs tests/groq-model-provider.test.mjs
```

### 4. Load Extension into Chrome
1. Navigate to `chrome://extensions` in Google Chrome.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the folder:
   `apps/extension`
4. To reload after code changes:
   - Click the built-in **`🔄 Reload`** button inside the extension popup header, OR
   - Click the circular reload arrow icon on the extension card in `chrome://extensions`.

---

## 5. Machine Learning Training Pipeline (`models/sih_training_pipeline.py`)

The ML pipeline is designed to train on-device vision models for browser privacy and export them directly to **ONNX Runtime Web**:

```bash
# Install required Python packages
python3 models/sih_training_pipeline.py --stage install

# Download open-source datasets (WIDER FACE, MIDV-500, Synthetic cards, WebSRC, Mind2Web)
python3 models/sih_training_pipeline.py --stage download

# Preprocess & merge datasets into YOLO and ViT formats
python3 models/sih_training_pipeline.py --stage preprocess

# Train YOLOv8n (detects card numbers, cardholder names, expiries, faces, ID docs)
python3 models/sih_training_pipeline.py --stage train_yolo

# Train ViT (classifies page safety: safe_page, pii_present, form_page, payment_page)
python3 models/sih_training_pipeline.py --stage train_vit

# Export models to ONNX for browser deployment via onnxruntime-web
python3 models/sih_training_pipeline.py --stage export
```

---

## 6. Critical Invariants to Maintain

1. **Mandatory Documentation Check**: Incoming agents MUST review `.md` files before making code changes.
2. **Never Hardcode Website Selectors**: Always use dynamic element discovery (`InteractiveElementRegistry` / `observeInteractiveDom`) which evaluates live DOM elements, bboxes, and accessible labels.
3. **Multi-Step Re-Act Loop**: When a task requires multiple interactions (e.g. search -> filter -> click product -> add to cart), execute one action per step, wait for DOM settlement, re-observe the live page, and query the model with updated context until `isComplete: true`.
4. **Intent Separation**: When the user requests *"Add to cart"* or *"Select first item"*, target interactive product cards and action buttons directly; do not type conversational phrases into search inputs.
5. **Zero Raw Secret Exposure**: Never pass unsanitized input values, passwords, credit cards, or raw screenshot buffers into the remote reasoning payload.
6. **CSP Disarming for Pseudo-Protocols**: When performing clicks, always disarm `javascript:void(0)` and `javascript:` URLs via `safeClick` so that Chrome Manifest V3 Content Security Policy does not block the interaction.
7. **Clean Relative Paths Only**: Never include absolute machine paths in documentation files or source code references.
