# Architecture Decisions & Trust Boundary

> 📌 **Mandatory Note for AI Agents**: Read [`../AGENTS.md`](../AGENTS.md) and [`../to-do.md`](../to-do.md) first before modifying architecture or data flows.

---

## 1. The Trust Boundary

The Chrome Extension and Privacy Core run strictly on-device. Raw webpage DOM, unmasked PII, credentials, and the local privacy vault never leave the user's device.

Only a sanitized, privacy-filtered payload is permitted to cross the network boundary to reasoning models or telemetry services.

---

## 2. End-to-End Data Flow

```text
                                  LOCAL CLIENT BROWSER
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                         │
│  Live Webpage DOM ──► Dynamic Perception (InteractiveElementRegistry: el_1, el_2)        │
│          │                                                                              │
│          ├──────────► Local PII Detection & Luhn Validator (content-pii.js)             │
│          │                               │                                              │
│          │                               ▼                                              │
│          │                 Privacy Policy Engine (policy-engine.js)                     │
│          │                 ├── ALLOW                                                    │
│          │                 ├── REDACT                                                   │
│          │                 ├── TOKENIZE                                                 │
│          │                 └── LOCAL_ONLY ──► In-Memory Local Vault (privacy-vault.js)  │
│          │                                                                              │
│          ▼                                                                              │
│  MultimodalVisionAgent (multimodal-vision-agent.js)                                     │
│  ├── 1. Redacted Screenshot: On-device visual PII bounding box blackouts                │
│  └── 2. Sanitized DOM Context: Semantic elements with abstract IDs el_1, el_2          │
│                                                                                         │
└──────────────────────────────────────────┬──────────────────────────────────────────────┘
                                           │ (Sanitized Egress / Port 8765 Relay)
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           REMOTE MODEL REASONING BOUNDARY                               │
│                                                                                         │
│  Hugging Face (Qwen3-VL-4B) / OpenRouter / Groq / Local Heuristic                       │
│  • Consumes: Redacted Screenshot + Sanitized DOM tree                                   │
│  • Produces: Abstract Action Intent (e.g. CLICK el_3, TYPE el_1 "white shoes")          │
│                                                                                         │
└──────────────────────────────────────────┬──────────────────────────────────────────────┘
                                           │ (Action Proposals Only)
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               LOCAL EXECUTION AUTHORITY                                 │
│                                                                                         │
│  BrowserActionEngine (browser-action-engine.js)                                         │
│  • Validates target existence and freshness (isConnected check)                         │
│  • Authorizes vault secret injection for local input if approved                        │
│                                                                                         │
│  ActionRuntime (action-runtime.js) & DomDriver (dom-driver.js)                          │
│  • safeClick: Disarms javascript:void(0) pseudo-protocols to eliminate MV3 CSP errors  │
│  • Executes authoritative DOM mutations: CLICK, TYPE, CHECK, SELECT, PRESS_KEY          │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Policy Decision Precedence

The local privacy engine enforces four deterministic decisions before any data may be handled:

1. **`ALLOW`**: Explicitly non-sensitive data (e.g. search keywords like `"running shoes"`, public UI labels).
2. **`LOCAL_ONLY`**: High-security credentials (passwords, payment cards, OTPs) used strictly for authorized local browser actions. Never sent remotely.
3. **`TOKENIZE`**: Context-relevant sensitive items needed for reference (e.g. email replaced by `{{EMAIL_1}}`). The raw value remains in the local vault.
4. **`REDACT`**: Sensitive or uncertain information not needed for task completion is permanently masked. Default decision.

---

## 4. CSP-Safe Navigation & Click Invariant

Webpages frequently attach click handlers to anchors with pseudo-protocol hrefs (e.g. `<a href="javascript:void(0)">` on Amazon). When clicked from an extension context, the browser default action attempts to navigate to the JavaScript URL, violating Chrome Manifest V3 Content Security Policy.

The `safeClick` engine:
1. Temporarily disarms the anchor's `href` attribute.
2. Attaches a capturing `preventDefault` handler.
3. Dispatches realistic mouse events (`mousedown`, `mouseup`, `click`) and executes `.click()`.
4. Restores the original `href` in a `finally` block.
This ensures 100% compatibility with all webpage event listeners while completely eliminating CSP errors.
