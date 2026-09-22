# Known Limitations & Engineering Boundaries

> 📌 **Engineering Note**: This document outlines known boundaries of the current prototype. A clear understanding of limitations is essential for evaluating production readiness and scoping future enhancements.

---

## 1. Distinction: Agent Planning & VLM Reasoning vs. Privacy Architecture

It is critical to distinguish between **agent action planning capabilities** and the **core privacy architecture**:
- The **Privacy Architecture** (detection, context analysis, `PolicyEngine` 4-way evaluation, unified sanitization, vault isolation, and telemetry scrubbing) is robust and enforced by 583 passing regression tests across the codebase.
- The **VLM-Driven Agent Planner** (Qwen VLM multimodal reasoning, dynamic task decomposition, extension working memory `AgentState`, and `VlmActionValidator`) operates autonomously across unconstrained real-world websites.

---

## 2. Identified Engineering Limitations

### 1. Multimodal VLM Reasoning Latency & Token Boundaries
- **Context**: The system has transitioned from rigid regex-based task planning to dynamic multimodal reasoning powered by Qwen VLM. The raw user instruction, sanitized structural DOM (`el_1`, `el_2`), on-device redacted screenshot, and extension working memory (`AgentState`) are evaluated holistically by the model to determine the next task and action.
- **Operational Boundaries**:
  - **Inference Latency**: Processing high-resolution redacted screenshots combined with serialized DOM contexts introduces network transport and multimodal model latency (typically 1.5–4.5s per step on remote providers) compared to instantaneous local heuristics.
  - **Dynamic Replanning on Unexpected Modals**: When websites render dynamic popups or cookie consent overlays, Qwen VLM can signal dynamic replanning (`replan: true`). If the model hallucinates an invalid element ID, the local `VlmActionValidator` immediately rejects the action, and 3x repeated action stagnation triggers loop detection.
  - **Canvas-Only UI Elements**: Web applications that render interactive controls strictly inside HTML5 `<canvas>` elements without accessible DOM nodes cannot be indexed with abstract element IDs (`el_1`, `el_2`), requiring visual coordinate fallbacks.

### 2. High-Entropy Arbitrary Secret Detection
- **Context**: On-device PII perception detects sensitive data using structured patterns (email, phone, credit cards, dates), semantic DOM attributes (`type="password"`, `autocomplete`, ARIA labels), OCR, YOLO visual bounding boxes, and GLiNER NER.
- **Limitation**: Arbitrary high-entropy secret strings (e.g. raw API keys, custom cryptographic hex tokens, or proprietary internal tokens) that appear as plain unstructured text inside generic `<div>` or `<p>` elements without semantic attributes or standard prefix patterns may not be classified as secrets.
- **Mitigation**: Password inputs, OTP fields, credit cards, and form credentials with standard semantic attributes are reliably detected and routed to `LOCAL_ONLY` or `TOKENIZE`.

### 3. Chrome Manifest V3 Runtime Constraints
- **Service Worker Lifecycles**: Manifest V3 background service workers may terminate during extended periods of inactivity. The extension uses explicit tab messaging and state persistence in `chrome.storage.local` to maintain session context, but long-running multi-tab orchestrations require active wakeups.
- **Active Tab Focus**: Certain DOM events (such as keypresses or focus-dependent dropdown menus) require the target browser tab to remain focused during action execution.
- **Cross-Origin Iframes**: Sandboxed or third-party cross-origin iframes that disallow content script injection cannot be directly inspected by the extension perception layer due to browser security restrictions.

### 4. Dynamic Single-Page Application (SPA) Rerendering
- **Context**: Complex dynamic web applications (e.g. React, Angular, Vue) mutate the DOM asynchronously after user interactions.
- **Mitigation & Boundary**: The extension implements DOM settlement pauses (`waitForDomSettlement`) and stale-target recovery in `BrowserActionEngine`. However, extreme dynamic transitions (e.g. multi-second WebSocket-driven page re-renders) may occasionally require additional polling cycles.
