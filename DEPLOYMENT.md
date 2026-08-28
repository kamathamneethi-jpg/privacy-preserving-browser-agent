# Deployment & Operating Guide — Privacy-Preserving Lightweight Browser Agent

This document provides complete instructions for setting up, deploying, verifying, and demonstrating the **Privacy-Preserving Lightweight Browser Agent**.

---

## 1. System Requirements & Architecture Overview

- **Runtime**: Node.js $\ge$ 20.0.0
- **Browser**: Google Chrome / Chromium with Manifest V3 support
- **Core Architecture**:
  - `apps/extension`: Manifest V3 Chrome Extension local browser agent runtime.
  - `packages/privacy-core`: Local perception, PII detection, Privacy Policy Engine, Vault, Sanitized Context Builder, Secure Communication Client, and Browser Action Engine.
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
Edit `.env` to supply runtime endpoints and authentication keys (never commit `.env` or real credentials to version control):
```env
REASONING_BACKEND_URL=https://your-secure-backend-endpoint.invalid/reason
REASONING_API_KEY=your_runtime_injected_api_key
SECURE_TRANSPORT_MODE=REAL_REMOTE_TRANSPORT
```

### Step 3: Load Chrome Extension (Local Developer Mode)
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** toggle in the top-right corner.
3. Click **Load unpacked** and select the folder:
   `c:\Users\ashri\.codex\.chatgpt-projects\g-p-6a905d6f723c81918ea039190416dff7\apps\extension`
4. Confirm Manifest V3 extension popup loads cleanly.

---

## 3. Automated Verification & Testing

### Run All 17 Step Verification Scripts
```bash
node scripts/check-structure.mjs; node scripts/check-extension.mjs; node scripts/check-privacy.mjs; node scripts/check-pii-detector.mjs; node scripts/check-step5-localization.mjs; node scripts/check-step6-robustness.mjs; node scripts/check-step7-context.mjs; node scripts/check-step8-policy.mjs; node scripts/check-step9-vault.mjs; node scripts/check-step10-visual.mjs; node scripts/check-step11-sanitized-context.mjs; node scripts/check-step12-onnx.mjs; node scripts/check-step13-webgpu.mjs; node scripts/check-step14-actions.mjs; node scripts/check-step15-reasoning.mjs; node scripts/check-step16-secure-communication.mjs; node scripts/check-step17-e2e.mjs
```

### Run Full Privacy Test Suite
```bash
npm run test:privacy
```

---

## 4. Run SIH Demonstration Workflow

To execute the interactive SIH demonstration script showing non-sensitive search, sensitive form automation (vault-authorized local action), and malicious page rejection:
```bash
node scripts/run-sih-demo.mjs
```

---

## 5. Privacy & Security Invariants

- **Raw PII Protection**: Raw passwords, credit cards, emails, phone numbers, and OTPs are redacted or tokenized locally before sanitization.
- **Vault Secret Isolation**: Vault secrets remain stored locally under Step 9 and are NEVER transmitted to remote reasoning servers.
- **Action Execution Authority**: Step 14 `BrowserActionEngine` retains 100% execution authority over all browser actions. Remote reasoning produces action proposals only.
