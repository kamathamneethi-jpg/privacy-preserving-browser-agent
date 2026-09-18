# AGENTS.md — Master Guide & Architectural Context

> **CRITICAL FOR ALL INCOMING AI AGENTS & DEVELOPERS**:
> Read this document **FIRST** before analyzing, modifying, or testing any code in this repository.

---

## 1. Project Overview & Mission

This project is a **Privacy-Preserving Autonomous Browser Agent** built for **Smart India Hackathon (SIH 2026)**.

The system allows users to give natural language tasks to an autonomous browser agent (e.g., *"Open Amazon, search for Nike shoes, filter by size, and add the first shoe to cart"* or *"Fill out this registration form"*), while strictly enforcing a **100% On-Device Privacy Boundary**.

### Core Privacy Invariants
1. **Zero Raw Secrets Over the Wire**: Raw passwords, credit card numbers (Luhn-validated), OTPs, personal identity numbers, and raw PII **NEVER** leave the client browser.
2. **Zero Screenshot / Pixel Leakage**: The agent does **NOT** upload raw screenshots to remote LLMs. All perception is performed on-device.
3. **Abstract Element IDs**: The external reasoning model (Groq / OpenRouter) receives only sanitized, structural DOM element metadata with opaque IDs (`el_1`, `el_2`, `el_3`) and bounding boxes.
4. **Local Execution Authority**: Only the local extension runtime has the authority to execute browser actions (click, type, select, check). The remote model merely proposes abstract intent.

---

## 2. What to Read & Check First (Reading Order)

When starting work on this repository, follow this exact reading sequence:

1. **[`AGENTS.md`](file:///Users/shahrukh/Desktop/sih/AGENTS.md)** *(this file)*: Architecture, rules, reading order, and active conventions.
2. **[`to-do.md`](file:///Users/shahrukh/Desktop/sih/to-do.md)**: Current completion status, open items, and task priorities.
3. **[`progress.md`](file:///Users/shahrukh/Desktop/sih/progress.md)**: Complete chronological changelog of implemented features.
4. **[`packages/privacy-core/`](file:///Users/shahrukh/Desktop/sih/packages/privacy-core/)**:
   - `interactive-element-registry.js`: Dynamic DOM perception & element discovery (`el_1`, `el_2`, labels, bboxes).
   - `secure-communication-client.js`: Strict payload validation & remote boundary firewall.
   - `browser-agent-coordinator.js`: Orchestration engine.
5. **[`apps/extension/src/`](file:///Users/shahrukh/Desktop/sih/apps/extension/src/)**:
   - `popup.js`: Extension UI, multi-step Re-Act agent loop (`MAX_STEPS = 6`), model dispatching, and auto-navigation.
   - `action-runtime.js`: Content script executing authoritative DOM actions (`CLICK`, `TYPE`, `CHECK`, `SELECT`, `PRESS_KEY`).
   - `content.js`: Injected content script handling message routing.
6. **[`models/sih_training_pipeline.py`](file:///Users/shahrukh/Desktop/sih/models/sih_training_pipeline.py)**: On-device ML pipeline (YOLOv8 for visual PII & ViT for context classification).

---

## 3. Key Architecture & File Map

```
sih/
├── apps/
│   └── extension/             # Chrome Extension (Manifest V3)
│       ├── manifest.json      # Extension manifest (MV3, scripting, storage, all_urls)
│       ├── popup.html         # User popup interface with terminal stream & settings
│       ├── dist/              # Generated bundled extension files (load in Chrome)
│       └── src/
│           ├── popup.js       # Multi-step Re-Act loop, auto-navigation, Groq integration
│           ├── action-runtime.js # Authoritative DOM action executor (click, type, check)
│           └── content.js     # Content script listener and bridge
├── packages/
│   └── privacy-core/          # Core privacy & perception library
│       └── src/
│           ├── interactive-element-registry.js  # Dynamic DOM scanner & element serializer
│           ├── secure-communication-client.js   # Zero-leakage payload transport
│           ├── privacy-policy-engine.js         # Redact/Tokenize/Protect decisions
│           ├── visual-model-adapter.js          # Hardware-aware ONNX Runtime adapter
│           └── webgpu-manager.js                # WebGPU acceleration with WASM fallback
├── models/
│   └── sih_training_pipeline.py # 5-stage ML training pipeline (YOLOv8 + ViT + ONNX)
├── scripts/
│   ├── build-extension.mjs    # ESBuild bundler injecting .env variables into dist/
│   ├── extension-log-server.mjs # Live terminal log relay server on port 3001
│   └── test-live-openrouter.mjs # Live model sanity tester
└── tests/                     # 309+ automated privacy, DOM, and model test cases
```

---

## 4. Key Workflows & Commands

### Building & Running the Extension
```bash
# 1. Build extension bundle (generates apps/extension/dist/)
npm run build:extension

# 2. Start live terminal logging server (shows real-time agent execution in terminal)
npm run dev:logs

# 3. Run all automated privacy & security test suites (309 tests)
npm run test:privacy

# 4. Run DOM action & model integration tests
node --test tests/generic-dom-actions.test.mjs tests/groq-model-provider.test.mjs
```

### Loading Extension into Chrome
1. Navigate to `chrome://extensions` in Google Chrome.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the folder:
   `/Users/shahrukh/Desktop/sih/apps/extension`
4. The extension icon will appear in the toolbar.

---

## 5. Machine Learning Training Pipeline (`models/sih_training_pipeline.py`)

The ML pipeline is designed to train on-device vision models for browser privacy and export them directly to **ONNX Runtime Web**:

```bash
# Install all required Python packages
python3 models/sih_training_pipeline.py --stage install

# Download / generate open-source datasets (WIDER FACE, MIDV-500, Synthetic cards, WebSRC, Mind2Web)
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

1. **Never hardcode website selectors**: Always use dynamic element discovery (`observeInteractiveDom` / `InteractiveElementRegistry`) which evaluates live DOM elements, bboxes, and accessible labels.
2. **Multi-Step Re-Act Loop**: When a task requires multiple interactions (e.g. search -> filter -> click product -> add to cart), execute one action per step, wait for DOM settlement, re-observe the live page, and query the model with updated context until `isComplete: true`.
3. **Intent Separation**: When the user requests *"Add to cart"* or *"Select first item"*, do not type conversational phrases into search inputs; target interactive product cards and action buttons directly.
4. **Zero Raw Secret Exposure**: Never pass unsanitized input values, passwords, credit cards, or raw screenshot buffers into the remote reasoning payload.

