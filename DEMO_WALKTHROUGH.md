# SIH Demonstration Walkthrough — Privacy-Preserving Lightweight Browser Agent

> 📌 **Mandatory Note for AI Agents**: Read [`AGENTS.md`](AGENTS.md) and [`progress.md`](progress.md) first before running or modifying demonstration workflows.

This document describes the reproducible demonstration workflow for SIH evaluation, showing how the Privacy-Preserving Lightweight Browser Agent automates web tasks while guaranteeing that raw PII and vault secrets NEVER cross the remote boundary.

---

## 1. Executive Demonstration Overview

```text
USER TASK
    ↓
Chrome Extension (Manifest V3 Popup / Background Worker)
    ↓
Local Page Perception & Multi-Signal PII Detection
    ↓
Privacy Policy Engine & Secure Local Vault
    ↓
Dual-Modality Sanitization:
  • Redacted Screenshot (On-device PII bounding box blackouts)
  • Sanitized Structural DOM (Opaque IDs el_1, el_2, ...)
    ↓
Secure Communication Client / Local Observability Relay (Port 8765)
    ↓
Reasoning Engine (Hugging Face Qwen3-VL-4B / OpenRouter / Local Heuristic)
    ↓
Browser Action Engine Security & Target Validation
    ↓
CSP-Safe Local ActionRuntime DOM Execution (safeClick disarming javascript: URLs)
```

---

## 2. Demonstration Scenarios

### Scenario 1: Multi-Step eCommerce Search & Facet Filtering
- **User Request**: *"Search for white running shoes under 7k on Amazon, filter by size, and select the first item"*
- **Pipeline Execution**:
  1. Multi-signal DOM scanner perceives interactive elements and assigns opaque IDs (`el_1`, `el_2`, ...).
  2. The agent types `"white running shoes"` into the search box and presses Enter.
  3. On the search results page, the agent identifies the price filter facet and size checkbox.
  4. The CSP-safe runtime (`safeClick`) disarms `javascript:void(0)` pseudo-protocol links, dispatching mouse events cleanly without triggering Chrome Manifest V3 CSP navigation violations.
  5. The agent clicks the first organic product card (ignoring sponsored ads).
- **Outcome**: `COMPLETED` (0 CSP errors, 0 raw PII exposed).

### Scenario 2: Sensitive Form Fill Automation (Vault Secret Kept 100% Local)
- **User Request**: *"Fill payment form using stored vault card details"*
- **Pipeline Execution**:
  1. Multi-signal PII detector scans page text and identifies credit card number `4532 0123 4567 8910`.
  2. Privacy Policy Engine issues `REDACT` and `LOCAL_ONLY` policy rules.
  3. Sensitive card number is stored in the Secure Local Vault.
  4. Sanitized Context Builder replaces card number with opaque marker `[LOCAL_ONLY_PROTECTED]`.
  5. Secure Transport client transmits sanitized payload.
     - **VERIFIED**: Raw card number `4532 0123 4567 8910` WAS NOT TRANSMITTED REMOTELY.
  6. Remote reasoning returns proposal to submit form.
  7. `BrowserActionEngine` authorizes local vault secret retrieval for local browser action execution.
- **Outcome**: `COMPLETED` (0 privacy violations, 1 authorized local vault retrieval).

### Scenario 3: Real-Time Observability & Dual-Modality Transmission
- **Setup**: Start the observability backend via `node scripts/extension-log-server.mjs` and open `http://127.0.0.1:8765`.
- **Pipeline Execution**:
  1. Extension popup sends live telemetry events (`TASK_SUBMITTED`, `DOM_PERCEPTION`, `AI_MULTIMODAL_INGESTION`, `ACTION_EXECUTION`) to the local server over HTTP.
  2. The server broadcasts events in real time to connected web clients via Server-Sent Events (SSE).
  3. The dashboard UI renders:
     - Real-time event log with color-coded stage badges.
     - Redacted screenshot thumbnail (verifying 0 raw PII in visual stream).
     - Expandable sanitized DOM tree.
     - Exportable JSON audit trail (`GET /api/export`).
- **Outcome**: `COMPLETED` (Real-time observability without remote privacy leakage).

### Scenario 4: Malicious Webpage & Unsafe Proposal Rejection
- **User Request**: *"Navigate user account dashboard"*
- **Pipeline Execution**:
  1. Page contains `<script>eval('alert(1)')</script>` and `javascript:eval(1)` link.
  2. Context Builder strips unsafe `<script>` tags and `javascript:` attributes.
  3. `BrowserActionEngine` rejects unsafe URL schemes and script execution proposals.
- **Outcome**: `COMPLETED` (Unsafe proposals denied, 0 script injection allowed).

---

## 3. How to Run the Automated Demo

Execute the demo script in your terminal:
```bash
node scripts/run-sih-demo.mjs
```
The script outputs the system capability report, dynamic security audit status, and step-by-step trace across all demonstration scenarios.
