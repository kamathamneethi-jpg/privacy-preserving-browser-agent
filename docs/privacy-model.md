# Privacy Model & Decision Framework

> 📌 **Reference**: For formal contracts and schemas, consult [`../packages/shared-types/src/privacy-contracts.js`](../packages/shared-types/src/privacy-contracts.js) and [`../packages/privacy-core/src/policy-engine.js`](../packages/privacy-core/src/policy-engine.js).

---

## 1. Core Principle: Task-Aware Data Minimization

The central foundation of the privacy framework is **Task-Aware Data Minimization**:
> *Remote AI reasoning models receive only the minimum information necessary to deduce abstract navigation and form actions. Local browser execution retains full authority over real values and secrets.*

### Critical Distinction: Task Relevance vs. Remote Disclosure Necessity
A common flaw in agent design is assuming that if a field is relevant to a task, its raw value must be sent to the remote LLM. This model strictly decouples the two concepts:
- **Task Relevance**: Does this data relate to the user's current goal?
- **Remote Disclosure Necessity**: Does an external model actually need the unmasked value to propose the next user interface action?

For example:
- Entering an email requires the agent to target the email input field (`el_1`), but the remote LLM only needs to know that an email is being entered (`{{EMAIL_1}}`), not the user's real email address.
- An account password or 2FA code is essential for completing a login task, but its value must **never** be sent to a remote API. It is classified as `LOCAL_ONLY`, meaning only the local extension runtime accesses it.

---

## 2. The Four Deterministic Privacy Outcomes

The `PolicyEngine` evaluates contextual evidence and produces one of four deterministic outcomes for every detected piece of information:

| Decision | Meaning | Representation in Remote Payload | Representation in DOM | Screenshot Handling |
| :--- | :--- | :--- | :--- | :--- |
| **`ALLOW`** | Explicitly non-sensitive public metadata required for task comprehension. | Raw safe value (e.g. `"Running Shoes"`, `"$199.99"`) | Unmodified | Unmasked (Clear) |
| **`TOKENIZE`** | Sensitive data relevant to task reasoning where an abstract reference suffices. | Opaque Token (e.g. `{{EMAIL_1}}`, `{{PHONE_1}}`) | Replaced with token | **Masked (Solid Blackout)** |
| **`REDACT`** | Sensitive data not required for the task, or untrusted/unnecessary information. | `[REDACTED]` marker | Replaced with `[REDACTED]` | **Masked (Solid Blackout)** |
| **`LOCAL_ONLY`** | Critical security secrets (passwords, OTPs, CVVs, private keys). | **EXCLUDED** (Completely omitted from payload) | Protected locally `[LOCAL_ONLY_PROTECTED]` | **Masked (Solid Blackout)** |

---

## 3. Evaluation Dimensions

The `PolicyEngine` evaluates decisions using structured contextual dimensions produced by the `ContextAnalyzer`:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               CONTEXTUAL INPUT SIGNALS                                 │
├──────────────────────────────┬──────────────────────────────┬──────────────────────────┤
│ 1. Semantic Role             │ 2. Task Necessity            │ 3. Task Relevance        │
│ • ACCOUNT_IDENTIFIER         │ • REMOTE_REASONING_REQUIRED  │ • DIRECT_TARGET          │
│ • RECIPIENT                  │ • LOCAL_EXECUTION_ONLY       │ • CONTEXTUAL_REFERENCE   │
│ • SHIPPING_INFO              │ • CONTEXTUAL_REFERENCE       │ • INCIDENTAL_VISIBLE     │
│ • BILLING_INFO               │ • UNNECESSARY                │ • IRRELEVANT             │
│ • AUTH_SECRET                │ • UNKNOWN                    │ • UNKNOWN                │
│ • SEARCH_TARGET              ├──────────────────────────────┼──────────────────────────┤
│ • PUBLIC_ATTRIBUTE           │ 4. Sensitivity Level         │ 5. Destination & Auth    │
│ • CONTEXTUAL_REFERENCE       │ • PUBLIC                     │ • REMOTE_REASONING       │
│ • GENERAL_DATA               │ • LOW / MEDIUM               │ • LOCAL_BROWSER          │
│ • UNKNOWN                    │ • HIGH / CRITICAL            │ • LOCAL_EXTENSION        │
└──────────────────────────────┴──────────────────────────────┴──────────────────────────┘
                                               │
                                               ▼
                              PolicyEngine AUTHORITATIVE EVALUATION
                                               │
                                               ▼
                                      Single PolicyDecision
                              (ALLOW | TOKENIZE | REDACT | LOCAL_ONLY)
```

### A. Semantic Roles (`SEMANTIC_ROLES`)
- `ACCOUNT_IDENTIFIER`: User identifiers, login usernames, profile emails.
- `RECIPIENT`: Destination address or recipient of a communication or order.
- `SHIPPING_INFO`: Physical shipping addresses and delivery instructions.
- `BILLING_INFO`: Payment card details, billing addresses, invoice information.
- `AUTH_SECRET`: Passwords, PINs, OTP codes, 2FA tokens, session keys.
- `SEARCH_TARGET`: Search terms, product queries, topic names.
- `PUBLIC_ATTRIBUTE`: Product titles, prices, ratings, button labels, public headlines.
- `CONTEXTUAL_REFERENCE`: Supporting contextual text that is not a primary target.
- `GENERAL_DATA`: Unclassified form inputs or text.
- `UNKNOWN`: Unrecognized content (treated conservatively).

### B. Task Necessity (`TASK_NECESSITY_LEVELS`)
- `REMOTE_REASONING_REQUIRED`: The remote model needs an abstract token to decide the action sequence.
- `LOCAL_EXECUTION_ONLY`: The value is required solely by the local browser executor (e.g. credential fields).
- `CONTEXTUAL_REFERENCE`: Helpful background context, but can be redacted without failing the task.
- `UNNECESSARY`: Entirely irrelevant to user intent; must be redacted.
- `UNKNOWN`: Conservative default.

### C. Sensitivity Levels (`SENSITIVITY_LEVELS`)
- `PUBLIC`: Publicly visible webpage data (product catalog, public articles).
- `LOW`: Generic non-identifying operational text.
- `MEDIUM`: Names, emails, general contact information.
- `HIGH`: Physical street addresses, account numbers, government identifiers.
- `CRITICAL`: Passwords, payment card numbers, CVVs, OTP/2FA codes, authentication tokens.

---

## 4. Critical Security Secrets (`LOCAL_ONLY`) & Token Resolution

Critical secrets and tokenized values receive special architectural isolation:
1. **Zero Remote Transmission**: Passwords, OTP codes, and payment credentials are never sent across the network under any policy, prompt, or configuration. Outbound messages from `MultimodalVisionAgent` run strict security assertions that throw exceptions if any raw secret appears in the payload.
2. **Local Privacy Vault Isolation**: Real values for sensitive fields are stored exclusively in the in-memory `PrivacyVault` (`packages/privacy-core/src/privacy-vault.js`) with isolated access purposes (`LOCAL_ACTION`).
3. **Local Action Authorization & Token Resolution**: When the Qwen VLM agent proposes an action like `TYPE el_1 "{{EMAIL_1}}"`, the local `VlmActionValidator` (`validateVlmAction`) intercepts the proposal, verifies element existence, and resolves `{{EMAIL_1}}` back to the real secret from `PrivacyVault` immediately prior to DOM mutation. The remote reasoning engine never receives the secret value or the mapping table.

---

## 5. Illustrative Examples

> ⚠️ **Note**: The following examples illustrate how the decision engine evaluates contextual signals. They are **not** hardcoded rules or website-specific branches.

| Scenario | Detected Item | Category | Inferred Role | Task Necessity | Policy Decision | Remote Payload Value |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Product Search** | *"Wireless Headphones"* | Product Title | `SEARCH_TARGET` | `REMOTE_REASONING_REQUIRED` | `ALLOW` | `"Wireless Headphones"` |
| **Product Search** | *"$199.99"* | Price | `PUBLIC_ATTRIBUTE` | `CONTEXTUAL_REFERENCE` | `ALLOW` | `"$199.99"` |
| **Registration Form** | `"alex@example.com"` | Email | `ACCOUNT_IDENTIFIER` | `REMOTE_REASONING_REQUIRED` | `TOKENIZE` | `{{EMAIL_1}}` |
| **Checkout Flow** | `"+1-555-0188"` (Unused) | Phone | `ACCOUNT_IDENTIFIER` | `UNNECESSARY` | `REDACT` | `[REDACTED]` |
| **Account Verification**| `"SyntheticPass#2026"` | Password | `AUTH_SECRET` | `LOCAL_EXECUTION_ONLY` | `LOCAL_ONLY` | *(Excluded)* |
| **2FA Verification** | `"958214"` | OTP Code | `AUTH_SECRET` | `LOCAL_EXECUTION_ONLY` | `LOCAL_ONLY` | *(Excluded)* |
