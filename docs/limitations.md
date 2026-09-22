# Known Limitations & Engineering Boundaries

> 📌 **Engineering Note**: This document outlines known boundaries of the current prototype. A clear understanding of limitations is essential for evaluating production readiness and scoping future enhancements.

---

## 1. Distinction: Action Planning vs. Privacy Architecture

It is critical to distinguish between **agent action planning capabilities** and the **core privacy architecture**:
- The **Privacy Architecture** (detection, context analysis, `PolicyEngine` 4-way evaluation, unified sanitization, vault isolation, and telemetry scrubbing) is robust and enforced by 570 passing regression tests.
- The **Browser Agent Action Planner** (natural-language interpretation, dynamic heuristics, multi-step Re-Act loops) is an evolving autonomous system operating over unconstrained real-world websites.

---

## 2. Identified Engineering Limitations

### 1. Generic Natural-Language Action & Form Mutation Planning
- **Context**: The `GoalParser` and `TaskPlanner` use linguistic patterns, candidate roles, and semantic element matching to interpret user goals without site-specific hardcoding.
- **Limitation**: While common patterns such as `"change the email to X"`, `"update OTP to Y"`, or `"click on confirm Order"` are supported, highly ambiguous or non-standard linguistic constructions (e.g. conversational multi-sentence instructions without standard prepositional markers like `to`, `with`, `as`) may fail to correctly trigger form mutation planning or confirmation clicks.
- **Impact**: In such edge cases, the agent may default to general form filling or search heuristics. The privacy boundary remains fully protected, but the UI action may require user intervention.

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
