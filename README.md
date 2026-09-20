# Privacy-Preserving Autonomous Browser Agent

> 🚨 **MANDATORY INSTRUCTION FOR ALL INCOMING AI AGENTS & DEVELOPERS** 🚨:
> In **EVERY** new conversation, session, or task, you **MUST** read and review the `.md` documentation files **FIRST** before analyzing, modifying, or executing any code in this repository.
> Start with [`AGENTS.md`](AGENTS.md), then [`to-do.md`](to-do.md), [`progress.md`](progress.md), and [`DEMO_WALKTHROUGH.md`](DEMO_WALKTHROUGH.md).

> **Smart India Hackathon (SIH 2026)**
> A privacy-first autonomous browser agent that perceives webpages, reasons over structural DOM and visual layout, and executes multi-step web tasks while keeping 100% of sensitive information and secrets strictly on the user's local device.

---

## 🔒 The Zero-Leakage Privacy Boundary

Raw sensitive data **NEVER** leaves the client's browser. The extension detects sensitive content locally and enforces strict on-device privacy decisions before sharing sanitized context with remote models:

- **`REDACT`** — Replaces irrelevant sensitive data with opaque redaction markers.
- **`TOKENIZE`** — Replaces task-relevant sensitive fields with local abstract references (e.g. `{{EMAIL_1}}`, `{{PHONE_1}}`).
- **`LOCAL_ONLY`** — Retains high-security secrets (passwords, OTPs, credit cards) exclusively inside the local encrypted privacy vault. The remote AI receives only abstract actions.
- **Dual-Modality Redaction**: Visual perception and OCR happen on-device. When screenshots are sent to multimodal reasoning models, detected sensitive regions are blacked out on-device beforehand.
- **CSP-Safe Execution Authority**: Action execution happens exclusively within the local browser runtime with `safeClick` disarming `javascript:` pseudo-protocols to prevent Content Security Policy violations.

---

## 🚀 Quickstart & Workflows

### 1. Build Extension Bundle
```bash
node scripts/build-extension.mjs
```
Generates production files in `apps/extension/dist/`.

### 2. Launch Observability Server & Live Telemetry Dashboard
```bash
node scripts/extension-log-server.mjs
```
- **Live Web Dashboard**: `http://127.0.0.1:8765`
- **Real-Time SSE Stream**: `http://127.0.0.1:8765/api/events/stream`
- **Telemetry Ingestion API**: `http://127.0.0.1:8765/api/events`
- **JSON Audit Export**: `http://127.0.0.1:8765/api/export`

### 3. Load Extension in Google Chrome
1. Navigate to `chrome://extensions` in Google Chrome.
2. Toggle **Developer mode** ON (top-right switch).
3. Click **Load unpacked** and select the folder:
   `apps/extension`
4. The extension icon will appear in your Chrome toolbar.
5. To reload after code changes, simply click the **`🔄 Reload`** button in the popup header.

### 4. Run Automated Tests
```bash
# Run privacy, DOM action, and observability test suites
node --test tests/generic-dom-actions.test.mjs tests/observability-backend.test.mjs tests/content-pii-scan.test.mjs tests/groq-model-provider.test.mjs
```

---

## 🤖 Supported Reasoning Models

The browser agent supports free-tier multimodal and reasoning models:

1. **Hugging Face Serverless (Multimodal Vision Agent)**:
   - Model: `Qwen/Qwen3-VL-4B-Instruct`
   - Requirement: Free Hugging Face User Access Token (`hf_...`)
   - Capabilities: Dual-modality ingestion (redacted screenshot + sanitized DOM tree)
2. **OpenRouter (Free Tier)**:
   - Models: `qwen/qwen-2.5-vl-72b-instruct:free`, `google/gemma-2-9b-it:free`, `meta-llama/llama-3.2-11b-vision-instruct:free`
   - Requirement: Free OpenRouter API Key
3. **Groq (Fast Cloud Inference)**:
   - Model: `llama-3.3-70b-versatile`
   - Requirement: Groq API Key
4. **Local On-Device Heuristic Planner (100% Offline & Free)**:
   - Requirement: None (zero API key, zero network egress, runs 100% locally on port 8765 or in-browser)

---

## 🎯 WebPII Object Detection (YOLO11n Fine-Tuning)

This sub-project fine-tunes a pretrained **YOLO11n** (`yolo11n.pt`) detector for on-device detection of 16 categories of Personally Identifiable Information (PII) on rendered webpage screenshots.

### Key Experiment Details
- **Architecture**: Ultralytics **YOLO11n** (Nano) starting from pretrained `yolo11n.pt` weights.
- **Dataset**: `datasets/webpii_yolo/`
  - **Train**: 40,384 images, 40,384 labels (469,135 annotations)
  - **Test**: 4,481 images, 4,481 labels (51,715 annotations)
  - **Total**: 44,865 images, 520,850 annotations across 16 classes
- **16 PII Classes**:
  ```text
  0: NAME             4: LOCATION         8: SECURITY_CODE    12: GIFT_CODE
  1: EMAIL            5: POSTCODE         9: USERNAME         13: COMPANY
  2: PHONE            6: DATE_OF_BIRTH   10: PASSWORD         14: COUNTRY
  3: ADDRESS          7: PAYMENT_CARD    11: PROMO_CODE       15: OTHER_PII
  ```

---

## 📁 Repository Layout

```text
privacy-preserving-browser-agent/
├── apps/
│   └── extension/             Chrome Extension (Manifest V3 popup, DOM perception, action runtime)
├── packages/
│   ├── privacy-core/          On-device PII detection, tokenization, vault, DOM registry, & vision agent
│   └── shared-types/          Shared schemas and privacy contracts
├── services/
│   └── reasoning-backend/     Sanitized remote reasoning adapter & payload validation
├── models/                    SIH 2026 on-device ML training pipeline (YOLOv8 + ViT + ONNX)
├── datasets/webpii_yolo/      44,865 image WebPII dataset in YOLO format
├── scripts/                   Build tools, live log server, dataset verifiers, and demo scripts
│   ├── build-extension.mjs    Extension bundler (ESBuild)
│   ├── extension-log-server.mjs Observability backend & SSE dashboard on port 8765
│   ├── run-sih-demo.mjs       Automated 3-scenario SIH demonstration runner
│   ├── verify_dataset.py      Dataset integrity checker
│   ├── check_environment.py   Hardware & CUDA diagnostic tool
│   ├── train_yolo.py          GPU training runner
│   └── evaluate_yolo.py       Full test-split metric evaluator
└── tests/                     328+ automated privacy, security, and DOM action test suites
```

---

## 📖 Key Documentation

- **[`AGENTS.md`](AGENTS.md)** — Master guide, architectural invariants, and mandatory reading order.
- **[`to-do.md`](to-do.md)** — Active roadmap and completion status.
- **[`progress.md`](progress.md)** — Detailed historical changelog.
- **[`DEMO_WALKTHROUGH.md`](DEMO_WALKTHROUGH.md)** — Step-by-step verification flows and demonstration scripts.
- **[`DEPLOYMENT.md`](DEPLOYMENT.md)** — Setup and deployment manual.
