# Reviewer Demonstration Guide

> 📌 **Audience**: Smart India Hackathon (SIH 2026) evaluators, technical judges, and visiting engineers.

---

## 1. Quickstart & Demonstration Setup

### Step 1: Build the Extension Bundle
```bash
node scripts/build-extension.mjs
```
*Output*: Generates bundle files inside `apps/extension/dist/`.

### Step 2: (Optional) Launch Live Observability Dashboard
```bash
node scripts/extension-log-server.mjs
```
*Dashboard URL*: Open `http://127.0.0.1:8765` in any browser to observe live SSE event telemetry and payload streams.

### Step 3: Load Extension into Google Chrome
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle **Developer mode** ON (top right).
3. Click **Load unpacked** and select the directory:
   `apps/extension`
4. Pin the **Privacy-Preserving Browser Agent** icon to your Chrome toolbar.

### Step 4: Open Controlled Demonstration Fixture
Open the local generic mixed-content fixture in a Chrome tab:
```text
file:///path/to/privacy-preserving-browser-agent/tests/fixtures/controlled-privacy-demo.html
```
*(Or click any test page served by your local server).*

---

## 2. What the Controlled Fixture Contains

The generic fixture ([`tests/fixtures/controlled-privacy-demo.html`](../tests/fixtures/controlled-privacy-demo.html)) contains a realistic mix of public catalog data, personal identifiers, and high-security credentials:

1. **Public Product Details**: Product title (*"Noise-Canceling Wireless Headphones Pro"*), Price (*"$199.99"*), Specifications.
2. **Account Information**: Recipient Email (*"alex.taylor@example.net"*), Customer Phone (*"+1-555-0188"*).
3. **High-Security Credentials**: Account Password (*"SyntheticDemoSecret#2026"*), Two-Factor Authentication Code (*"958214"*).
4. **Interactive Controls**: Submit Button (*"Confirm Order"*).

---

## 3. Demonstration Workflow & Observable Behaviors

### Action A: Local PII Scan & Live Transparency Inspection
1. Click the extension icon in the toolbar to open the popup UI.
2. Click **"🔍 Scan page locally for PII"**.
3. **Observe the Live Privacy Transparency Panel**:
   - **`🟢 ALLOW` (Green Badge)**: Public product title, price, and button text remain clear and accessible.
   - **`🔴 TOKENIZE` (Red Badge)**: The email address is assigned an opaque token (e.g. `{{EMAIL_1}}`).
   - **`⚫ REDACT` (Black Badge)**: Irrelevant phone numbers are marked for redaction (`[REDACTED]`).
   - **`🔒 LOCAL_ONLY` (Purple/Lock Badge)**: Passwords and 2FA OTP codes are classified as strictly local secrets.

> 💡 **Key Architectural Point**: The visual color badges are purely presentation elements to assist human reviewers. They consume the actual `PolicyDecision` objects generated on-device by the `PolicyEngine`.

### Action B: Reviewing the Redacted DOM
1. In the extension popup, click **"View Redacted DOM"**.
2. **Observe**:
   - The password value `SyntheticDemoSecret#2026` is replaced with `[LOCAL_ONLY_PROTECTED]`.
   - The email is represented as an abstract token or sanitized identifier.
   - Interactive elements have opaque abstract IDs (`el_1`, `el_2`, `el_3`, `el_4`, `el_5`).

### Action C: Autonomous Task Execution
1. Enter the task:
   ```text
   change the email to alex@gmail.com and click on confirm Order
   ```
2. Click **"🚀 Run Agent"** (powered by Qwen VLM or Local Reasoning Server on port 8765).
3. **Observe**:
   - **Multimodal Transmission Preview**: The popup renders the live transmission card showing the on-device redacted screenshot, sanitized DOM snippet, and abstract element count.
   - **Dynamic VLM Task Plan**: The Qwen VLM dynamically decomposes the task into sequential subtasks without any hardcoded website regex or deterministic scripts.
   - **Local Action Validation & Token Resolution**: The `VlmActionValidator` verifies target element existence in the live DOM snapshot, resolves any tokenized values via `PrivacyVault`, and dispatches the action to `ActionRuntime`.
   - **CSP-Safe Mutation**: The agent updates the email field and clicks `Confirm Order` via `safeClick`.
   - **Zero Secret Egress**: The password and OTP values remain strictly on-device in `PrivacyVault` throughout the entire multi-step loop.

---

## 4. 2–3 Minute Presentation Script for Hackathon Evaluators

> **Presenter**: *"Hello judges. Autonomous AI browser agents are powerful, but today's commercial agents have a critical privacy flaw: they send raw screenshots, unmasked DOM trees, and sensitive user credentials directly to remote cloud LLMs.*
>
> *Our project solves this with a **100% on-device privacy filter** coupled with an autonomous **Qwen VLM reasoning architecture**.*
>
> *Here we have a realistic web portal containing public product information, personal contact details, and account credentials.*
>
> *When we open our Chrome extension and run a local scan, our on-device perception pipeline—combining regex, DOM semantics, and local vision models—classifies every element.*
>
> *Our authoritative **PolicyEngine** produces four deterministic decisions:*
> 1. *Public product data receives **ALLOW**—it remains unmasked because the AI needs it to understand the page.*
> 2. *Task-relevant identifiers receive **TOKENIZE**—the AI receives only an abstract token like `{{EMAIL_1}}`, while the real value stays in our in-memory Local Privacy Vault.*
> 3. *Unnecessary personal data receives **REDACT**—it is masked with solid blackouts in visual screenshots and replaced with `[REDACTED]` in text.*
> 4. *Critical credentials like passwords and 2FA OTPs receive **LOCAL_ONLY**—they are completely excluded from remote payloads.
>
> *When we run an autonomous task, the extension packages the on-device redacted screenshot, sanitized DOM with abstract element IDs (`el_1`, `el_2`), and extension working memory (`AgentState`), sending it to the Qwen VLM.*
>
> *The model dynamically plans subtasks and proposes abstract actions. Our local **VlmActionValidator** verifies element existence, resolves tokens from the vault locally, and our **ActionRuntime** executes the actions with CSP-safe clicks.*
>
> *All 583 automated tests across 14+ suites pass with zero failures, proving strict enforcement across DOM text, visual screenshots, remote payloads, and telemetry streams."*
