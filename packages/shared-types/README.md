# Shared Types — Data Contracts & Schemas

> 📌 **Mandatory Note for AI Agents**: Read [`../../AGENTS.md`](../../AGENTS.md) and [`../../to-do.md`](../../to-do.md) first before modifying shared contracts.

This package defines strict data contracts shared between the Chrome extension, local privacy core, and remote reasoning interfaces.

---

## Key Contracts

1. **`BROWSER_ACTION_TYPES`**:
   - `CLICK`, `TYPE`, `CLEAR`, `CHECK`, `UNCHECK`, `SELECT`, `PRESS_KEY`, `SUBMIT`, `SCROLL`, `NAVIGATE`, `GO_BACK`, `WAIT`.
2. **`PRIVACY_POLICY_DECISIONS`**:
   - `ALLOW`: Public or non-sensitive information.
   - `REDACT`: Sensitive or unknown data masked permanently.
   - `TOKENIZE`: Task-relevant PII replaced by local tokens (e.g. `{{EMAIL_1}}`).
   - `LOCAL_ONLY`: Secrets stored in the local vault for local browser action execution only.
3. **`InteractiveElementDescription`**:
   - Standard structural schema for discovered DOM elements: `elementId`, `tag`, `role`, `text`, `ariaLabel`, `placeholder`, `bbox`, `isSponsored`, `isFilter`, `filterCategory`.
4. **`ReasoningPayload` & `ReasoningResponse`**:
   - Strictly validates that payloads sent to external models exclude raw PII, unmasked card numbers, passwords, and raw image buffers.
