# Deployment & Operating Guide — Privacy-Preserving Lightweight Browser Agent

> 📌 **Mandatory Note for AI Agents**: Read [`AGENTS.md`](AGENTS.md) and [`to-do.md`](to-do.md) first before deploying, building, or modifying this project.

This document provides complete instructions for setting up, deploying, verifying, and running the **Privacy-Preserving Lightweight Browser Agent**.

---

## 1. System Requirements & Architecture Overview

- **Runtime**: Node.js $\ge$ 20.0.0
- **Browser**: Google Chrome / Chromium with Manifest V3 support
- **Core Architecture**:
  - `apps/extension`: Manifest V3 Chrome Extension local browser agent runtime.
  - `packages/privacy-core`: Local perception, PII detection, Privacy Policy Engine, Vault, Sanitized Context Builder, Secure Communication Client, Multimodal Vision Agent, and Browser Action Engine.
  - `scripts/extension-log-server.mjs`: Real-time Observability Server & Live Telemetry Dashboard on port `8765`.
  - `services/reasoning-backend`: Isolated remote reasoning backend service.

---

## 2. Setup & Installation Steps

### Step 1: Clone Repository & Install Dependencies
```bash
git clone https://github.com/kamathamneethi-jpg/privacy-preserving-browser-agent.git
cd privacy-preserving-browser-agent
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Edit `.env` to supply optional model access keys (the agent can also run 100% locally with the Local Heuristic Planner without any API keys):
```env
# Free Hugging Face User Access Token for Qwen3-VL-4B-Instruct
HUGGINGFACE_API_KEY=hf_...
HUGGINGFACE_MODEL=Qwen/Qwen3-VL-4B-Instruct

# Or OpenRouter API Key for free tier models
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=qwen/qwen-2.5-vl-72b-instruct:free

# Or Groq API Key for fast reasoning
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
```

### Step 3: Build Extension Bundle
```bash
node scripts/build-extension.mjs
```
Generates production bundle in `apps/extension/dist/`.

### Step 4: Start Observability Server & Telemetry Dashboard
```bash
node scripts/extension-log-server.mjs
```
Open `http://127.0.0.1:8765` in your browser to view the real-time reasoning dashboard.

### Step 5: Load Chrome Extension
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (top-right switch).
3. Click **Load unpacked** and select the folder:
   `apps/extension`
4. To reload after code changes, simply click the **`🔄 Reload`** button inside the extension popup header.

---

## 3. Automated Verification & Testing

### Run All 17 Step Verification Scripts
```bash
node scripts/check-structure.mjs
node scripts/check-extension.mjs
node scripts/check-privacy.mjs
node scripts/check-pii-detector.mjs
node scripts/check-step5-localization.mjs
node scripts/check-step6-robustness.mjs
node scripts/check-step7-context.mjs
node scripts/check-step8-policy.mjs
node scripts/check-step9-vault.mjs
node scripts/check-step10-visual.mjs
node scripts/check-step11-sanitized-context.mjs
node scripts/check-step12-onnx.mjs
node scripts/check-step13-webgpu.mjs
node scripts/check-step14-actions.mjs
node scripts/check-step15-reasoning.mjs
node scripts/check-step16-secure-communication.mjs
node scripts/check-step17-e2e.mjs
```

### Run Privacy & Observability Test Suites
```bash
node --test tests/generic-dom-actions.test.mjs tests/observability-backend.test.mjs tests/content-pii-scan.test.mjs tests/groq-model-provider.test.mjs
```

---

## 4. Run SIH Demonstration Workflow

To execute the automated SIH demonstration script showing non-sensitive search, sensitive form automation (vault-authorized local action), and malicious page rejection:
```bash
node scripts/run-sih-demo.mjs
```

---

## 5. Privacy & Security Invariants

- **Raw PII Protection**: Raw passwords, credit cards, emails, phone numbers, and OTPs are redacted or tokenized locally before any external dispatch.
- **Visual PII Blackout**: Detected PII bounding boxes are redacted on-device before screenshots are provided to multimodal models.
- **Vault Secret Isolation**: Vault secrets remain stored locally and are NEVER transmitted to remote reasoning servers.
- **Execution Authority**: `BrowserActionEngine` retains 100% execution authority over all browser actions. Remote reasoning produces abstract action proposals only.
- **CSP Disarming**: Anchor tags with `javascript:` pseudo-protocols are disarmed during clicks via `safeClick`, preventing Manifest V3 Content Security Policy violations.
