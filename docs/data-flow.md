# End-to-End Data Flow

> 📌 **Reference**: For pipeline implementations, inspect [`../packages/privacy-core/src/sanitized-context-builder.js`](../packages/privacy-core/src/sanitized-context-builder.js), [`../packages/privacy-core/src/image-redactor.js`](../packages/privacy-core/src/image-redactor.js), and [`../packages/privacy-core/src/telemetry-sanitizer.js`](../packages/privacy-core/src/telemetry-sanitizer.js).

---

## 1. Complete Privacy Lifecycle

Information within the extension traverses a deterministic, stage-gated pipeline:

```text
1. RAW BROWSER CONTEXT
   • Live webpage DOM tree (inputs, buttons, links, text nodes)
   • Visual page viewport screenshot (bitmap)
   • User natural language task instruction (unaltered prompt)
                │
                ▼
2. LOCAL PERCEPTION & DETECTION
   • Interactive element discovery (InteractiveElementRegistry: el_1, el_2, ...)
   • Multi-signal PII detection (Regex, Luhn checks, DOM semantics, OCR, YOLO, GLiNER)
   • Spatial localization (bounding boxes: [x, y, width, height])
                │
                ▼
3. CONTEXT ANALYSIS & AUTHORITATIVE POLICY EVALUATION
   • ContextAnalyzer determines semantic role, task relevance, and operational necessity
   • PolicyEngine evaluates contextual signals against sensitivity policies
   • Emits a single, authoritative PolicyDecision per entity:
     [ ALLOW | TOKENIZE | REDACT | LOCAL_ONLY ]
                │
                ▼
4. UNIFIED SANITIZATION ENFORCEMENT
   ┌───────────────────┬───────────────────┬───────────────────┬───────────────────┬───────────────────┐
   │ 4A. DOM Redactor  │ 4B. ImageRedactor │ 4C. Remote Context│ 4D. Telemetry     │ 4E. Reviewer UI   │
   │ Text sanitized or │ Solid visual bbox │ Payload builder   │ Logging stream    │ Live transparency │
   │ tokenized in DOM  │ blackout on-device│ excludes secrets; │ scrubbed of raw   │ panel renders     │
   │ tree ({{TOKEN}})  │ before export     │ replaces tokens   │ inputs & tokens   │ color badge state │
   └───────────────────┴───────────────────┴───────────────────┴───────────────────┴───────────────────┘
                │
                ▼
5. DUAL-MODALITY PACKAGING & EXTENSION WORKING MEMORY
   • Extension initializes/updates AgentState (goal, tasks, currentTaskId, history, iteration)
   • MultimodalVisionAgent packages: Redacted Screenshot + Sanitized Structural DOM + AgentState
   • Strict on-device security assertion verifies zero raw secrets in outbound message strings
                │
                ▼
6. MULTIMODAL VLM REASONING (Secure Egress)
   • Qwen VLM reasoning engine processes multimodal perception and agent state
   • Performs natural-language understanding, dynamic task breakdown, and UI reasoning
   • Emits structured plan: tasks list, currentTaskId, replan flag, and proposed action (e.g. TYPE el_1 "{{EMAIL_1}}")
                │
                ▼
7. LOCAL ACTION VALIDATION & TOKEN RESOLUTION (VlmActionValidator)
   • Verifies target element existence in current interactive DOM snapshot
   • Blocks dangerous protocols (javascript:, file:, data:) for NAVIGATE actions
   • Resolves token {{EMAIL_1}} securely to real secret via local in-memory PrivacyVault
                │
                ▼
8. LOCAL ACTION EXECUTION & LOOP DEFENSE (ActionRuntime)
   • safeClick: Temporarily disarms javascript: pseudo-protocols to prevent MV3 CSP errors
   • Executes authoritative browser mutations: CLICK, TYPE, CHECK, SELECT, PRESS_KEY
   • AgentState records action, updates task completion, and flags 3x repeated action stagnation
```

---

## 2. Representation Breakdown by Privacy Outcome

Every entity is handled consistently across all five representations:

```text
               AUTHORITATIVE PolicyDecision
                            │
       ┌────────────────────┼────────────────────┐
       │                    │                    │
     ALLOW               TOKENIZE              REDACT / LOCAL_ONLY
       │                    │                    │
 ┌─────┴─────┐        ┌─────┴─────┐        ┌─────┴─────┐
 │ DOM: Text │        │ DOM: Token│        │ DOM: Mask │
 │ Image: Clr│        │ Image: Blk│        │ Image: Blk│
 │ Remote:Val│        │ Remote:Tok│        │ Remote:Nil│
 └───────────┘        └───────────┘        └───────────┘
```

### 1. `ALLOW` (Safe Public Metadata)
- **DOM Representation**: Original text preserved (e.g. `"Wireless Headphones Pro"`, `"$199.99"`).
- **Screenshot Representation**: Clear/unmodified visual bounding box.
- **Remote Reasoning Payload**: Sent in full as safe contextual metadata.
- **Telemetry Stream**: Standard structured event logging permitted.
- **Reviewer Transparency UI**: Displays `🟢 ALLOW` badge (Safe Context).

### 2. `TOKENIZE` (Task-Relevant Sensitive Data)
- **DOM Representation**: Replaced with an opaque token marker (e.g. `{{EMAIL_1}}`).
- **Screenshot Representation**: **Solid blackout** over the bounding box on-device before export.
- **Remote Reasoning Payload**: Sent as abstract token (e.g. `{"id": "el_1", "value": "{{EMAIL_1}}"}`). Raw value is stored exclusively in `PrivacyVault`.
- **Telemetry Stream**: Raw value scrubbed; token logged only if required for diagnostics.
- **Reviewer Transparency UI**: Displays `🔴 TOKENIZE` badge (Tokenized Reference).

### 3. `REDACT` (Unnecessary Sensitive Data)
- **DOM Representation**: Replaced with `[REDACTED]` marker.
- **Screenshot Representation**: **Solid blackout** over the bounding box on-device before export.
- **Remote Reasoning Payload**: Replaced with `[REDACTED]`. Value never enters the reasoning payload.
- **Telemetry Stream**: Completely scrubbed from all logging channels.
- **Reviewer Transparency UI**: Displays `⚫ REDACT` badge (Unnecessary / Masked).

### 4. `LOCAL_ONLY` (Critical Security Secrets)
- **DOM Representation**: Protected with `[LOCAL_ONLY_PROTECTED]` marker in sanitized tree; accessible only to local DOM drivers.
- **Screenshot Representation**: **Solid blackout** over the bounding box on-device before export.
- **Remote Reasoning Payload**: **Completely excluded** from the outbound JSON payload (zero egress).
- **Telemetry Stream**: Strictly scrubbed by `telemetry-sanitizer.js` (passwords, OTPs, CVVs never logged).
- **Reviewer Transparency UI**: Displays `🔒 LOCAL_ONLY` badge (Local Execution Only).

---

## 3. Remote Transmission & Communication Boundary

Outbound HTTP transmissions (to model inference APIs or observability relays) are mediated by [`packages/privacy-core/src/secure-communication-client.js`](../packages/privacy-core/src/secure-communication-client.js):

1. **Pre-Serialization Scan**: The payload is scanned recursively before serialization. If any un-tokenized raw credential or Luhn-valid card number is detected, transmission is immediately aborted with a security exception.
2. **Abstract IDs**: Interactive elements are transmitted strictly as opaque identifiers (`el_1`, `el_2`, `el_3`). Underlying website DOM IDs and complex internal paths are stripped.
3. **Redacted Visual Buffer**: When visual reasoning is used, the image buffer is generated from an on-device canvas where sensitive regions have already been overwritten with black rectangles. Raw screenshot buffers are never retained or transmitted.
