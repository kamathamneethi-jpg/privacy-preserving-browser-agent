# SIH Demonstration Walkthrough — Privacy-Preserving Lightweight Browser Agent

This document describes the reproducible demonstration workflow for SIH evaluation, showing how the Privacy-Preserving Lightweight Browser Agent automates web tasks while guaranteeing that raw PII and vault secrets NEVER cross the remote boundary.

---

## 1. Executive Demonstration Overview

```
USER TASK
    ↓
Chrome Extension (Manifest V3 Popup / Background Worker)
    ↓
Local Page Perception & Multi-signal PII Detection (Steps 3–6)
    ↓
Privacy Policy Engine & Secure Local Vault (Steps 7–9)
    ↓
Sanitized Context Builder (Step 11)
    ↓
Secure Communication Client (Step 16)
    ↓
Remote Reasoning Backend (Step 15 / Mock Provider)
    ↓
Browser Action Engine Security & Target Validation (Step 14)
    ↓
Local ActionRuntime DOM Interaction
```

---

## 2. Demonstration Scenarios

### Scenario 1: Non-Sensitive Product Search Automation
- **User Request**: *"Search for lightweight laptops online"*
- **Pipeline Execution**:
  1. Multi-signal PII detector scans page text. Zero sensitive items found.
  2. Step 11 Context Builder constructs sanitized DOM tree representation.
  3. Step 16 Secure Transport client transmits sanitized payload.
  4. Remote Reasoning returns `CLICK` action proposal for `search_btn`.
  5. Step 14 `BrowserActionEngine` validates target and executes search click locally.
- **Outcome**: `COMPLETED` (0 privacy violations).

### Scenario 2: Sensitive Form Fill Automation (Vault Secret Kept 100% Local)
- **User Request**: *"Fill payment form using stored vault card details"*
- **Pipeline Execution**:
  1. Multi-signal PII detector scans page text and identifies credit card number `4532 0123 4567 8910`.
  2. Step 8 Privacy Policy Engine issues `REDACT` and `LOCAL_ONLY` policy rules.
  3. Sensitive card number is stored in Secure Local Vault (Step 9).
  4. Step 11 Context Builder replaces card number with opaque marker `[LOCAL_ONLY_PROTECTED]`.
  5. Step 16 Secure Transport client transmits sanitized payload.
     - **VERIFIED**: Raw card number `4532 0123 4567 8910` WAS NOT TRANSMITTED REMOTELY.
  6. Remote Reasoning returns action proposal to click `pay_btn`.
  7. Step 14 `BrowserActionEngine` authorizes local vault secret retrieval for local browser action execution.
- **Outcome**: `COMPLETED` (0 privacy violations, 1 authorized local vault retrieval).

### Scenario 3: Malicious Webpage & Unsafe Proposal Rejection
- **User Request**: *"Navigate user account dashboard"*
- **Pipeline Execution**:
  1. Page contains `<script>eval('alert(1)')</script>` and `javascript:eval(1)` link.
  2. Step 11 Context Builder strips unsafe `<script>` tags and `javascript:` attributes.
  3. Step 14 `BrowserActionEngine` rejects unsafe URL schemes and script execution proposals.
- **Outcome**: `COMPLETED` (Unsafe proposals denied, 0 script injection allowed).

---

## 3. How to Run the Demo

Execute the demo script in terminal:
```bash
node scripts/run-sih-demo.mjs
```
The script will output the system capability report, dynamic security audit status, and step-by-step trace for all 3 scenarios.
