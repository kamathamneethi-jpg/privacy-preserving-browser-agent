# GEMINI.md — Instructions for AI Agents & Developers

> 🚨 **MANDATORY DIRECTIVE FOR ALL INCOMING AI AGENTS** 🚨:
> In **EVERY** new conversation, session, or task, you **MUST** read and review the project documentation `.md` files **FIRST** before analyzing, modifying, or executing any code in this repository.

---

## Mandatory Reading Sequence

When starting work or responding to a user prompt, consult the documentation in this exact order:

1. **[`AGENTS.md`](AGENTS.md)**: Master architecture guide, trust boundary, reading order, and critical invariants.
2. **[`to-do.md`](to-do.md)**: Current completion status, open items, and milestones.
3. **[`progress.md`](progress.md)**: Complete chronological changelog of implemented capabilities.
4. **[`DEMO_WALKTHROUGH.md`](DEMO_WALKTHROUGH.md)**: Step-by-step verification flows and test scenarios.
5. **[`README.md`](README.md)**: High-level overview, quickstart commands, and model configurations.
6. **[`docs/architecture.md`](docs/architecture.md)**: Trust boundary, data flows, and CSP invariants.
7. **[`packages/privacy-core/README.md`](packages/privacy-core/README.md)**: On-device privacy, perception, and action driver documentation.

---

## Non-Negotiable Core Invariants

1. **Read Documentation First**: Never jump into code changes or make assumptions without reviewing the `.md` documentation files first.
2. **Clean Relative Paths Only**: Always use relative paths (`path/to/file.ext` or `[name](path/to/file.ext)`). NEVER use machine-specific absolute paths (e.g., `file:///...`, `C:\...`, or `/Users/...`).
3. **100% On-Device Privacy**: Raw passwords, credit card numbers (Luhn-checked), OTPs, and personal identity numbers NEVER leave the client browser.
4. **Zero Raw Screenshot / Pixel Leakage**: When visual reasoning is used, sensitive regions are blacked out on-device beforehand via `MultimodalVisionAgent`.
5. **Abstract Element IDs**: External reasoning models receive only sanitized structural metadata with opaque IDs (`el_1`, `el_2`, `el_3`) and bounding boxes.
6. **Local Execution Authority**: Only the local browser runtime has the authority to execute actions (`CLICK`, `TYPE`, `CHECK`, `SELECT`, `PRESS_KEY`).
7. **CSP-Safe SafeClick**: All click actions must use `safeClick` / `safeClickElement` to disarm `javascript:void(0)` pseudo-protocols, preventing Chrome Manifest V3 CSP navigation errors.
