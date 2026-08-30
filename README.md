# Privacy-Preserving Autonomous Browser Agent

> **Smart India Hackathon (SIH 2026)**
> A privacy-first browser agent that perceives webpages and executes autonomous multi-step tasks while keeping 100% of sensitive information and secrets strictly on the user's local device.

---

## 🔒 The Zero-Leakage Privacy Boundary

Raw sensitive data **NEVER** leaves the client's browser. The extension detects sensitive content locally and enforces strict on-device privacy decisions before sharing sanitized context with remote LLMs:

- **`REDACT`** — Replaces irrelevant sensitive data with opaque redaction markers.
- **`TOKENIZE`** — Replaces task-relevant sensitive fields with local abstract references (e.g. `{{EMAIL_1}}`, `{{PHONE_1}}`).
- **`LOCAL_ONLY`** — Retains high-security secrets (passwords, OTPs, credit cards) exclusively inside the local encrypted privacy vault. The remote AI receives only abstract actions.
- **Zero Raw Screenshots / Pixels**: Visual perception and OCR happen on-device. Raw image buffers are blocked from transmission.

---

## 📁 Repository Layout

```text
apps/extension/             Chrome Extension (Manifest V3 popup, DOM perception, action runtime)
packages/privacy-core/      On-device PII detection, tokenization, vault, & DOM registry
services/reasoning-backend/ Sanitized remote reasoning adapter & payload validation
models/                     SIH 2026 On-device ML training pipeline (YOLOv8 + ViT + ONNX)
scripts/                    Build tools, live terminal log server, and sanity testers
tests/                      309+ automated privacy, security, and DOM action test suites
```

---

## 🚀 Quickstart & Workflows

### 1. Install & Build
```bash
# Install NPM dependencies
npm install

# Build the Chrome extension bundle (outputs to apps/extension/dist/)
npm run build:extension
```

### 2. Live Terminal Observability
```bash
# Start the live terminal logging relay server (displays real-time agent execution)
npm run dev:logs
```

### 3. Load the Extension in Chrome
1. Go to `chrome://extensions` in Chrome.
2. Toggle on **Developer mode**.
3. Click **Load unpacked** and select `apps/extension/`.

### 4. Run Automated Test Suites
```bash
# Run all 309 automated privacy & security test suites
npm run test:privacy

# Run DOM action driver & Groq model integration tests
node --test tests/generic-dom-actions.test.mjs tests/groq-model-provider.test.mjs
```

---

## 🧠 On-Device Machine Learning Pipeline (`models/sih_training_pipeline.py`)

Train on-device vision models (YOLOv8 for visual PII & ViT for context classification) and export to **ONNX Runtime Web**:

```bash
# Install Python ML dependencies
python3 models/sih_training_pipeline.py --stage install

# Download / generate open datasets (WIDER FACE, MIDV-500, Synthetic cards, WebSRC, Mind2Web)
python3 models/sih_training_pipeline.py --stage download

# Preprocess into YOLO & ViT datasets
python3 models/sih_training_pipeline.py --stage preprocess

# Train YOLOv8n detector
python3 models/sih_training_pipeline.py --stage train_yolo

# Train ViT classifier
python3 models/sih_training_pipeline.py --stage train_vit

# Export to ONNX for browser deployment
python3 models/sih_training_pipeline.py --stage export
```

---

## 📖 Key Documentation

- **[`AGENTS.md`](file:///Users/shahrukh/Desktop/sih/AGENTS.md)** — Master guide, architectural invariants, and reading order for AI models.
- **[`to-do.md`](file:///Users/shahrukh/Desktop/sih/to-do.md)** — Active roadmap and task status.
- **[`progress.md`](file:///Users/shahrukh/Desktop/sih/progress.md)** — Detailed historical changelog.
- **[`DEMO_WALKTHROUGH.md`](file:///Users/shahrukh/Desktop/sih/DEMO_WALKTHROUGH.md)** — Step-by-step verification flows.

