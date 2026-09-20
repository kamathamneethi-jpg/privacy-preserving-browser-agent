# Automated Test Suites

> 📌 **Mandatory Note for AI Agents**: Read [`../AGENTS.md`](../AGENTS.md) and [`../to-do.md`](../to-do.md) first before running or adding test suites.

This directory contains over 328 automated unit, integration, and security verification tests covering all subsystems of the Privacy-Preserving Browser Agent.

---

## Test Suites

1. **DOM Perception & Actions**:
   - `generic-dom-actions.test.mjs`: Tests `InteractiveElementRegistry` (`el_1`, `el_2`, bboxes), `DomDriver`, and `safeClick` disarming `javascript:void(0)` links.
   - `content-pii-scan.test.mjs`: Tests on-device DOM PII scanning, regex, and Luhn card validation.
   - `robust-detection.test.mjs`: Tests semantic attribute fusion and OCR overlap resolution.
2. **Observability & Telemetry**:
   - `observability-backend.test.mjs`: Tests real-time telemetry ingestion, SSE event streaming, JSON audit export, and multimodal vision ingestion on port `8765`.
3. **Privacy & Vault Security**:
   - `privacy-policy-engine.test.mjs`: Tests decision precedence (`ALLOW`, `REDACT`, `TOKENIZE`, `LOCAL_ONLY`).
   - `privacy-vault.test.mjs`: Tests temporary in-memory isolated vault, TTL expiration, and remote leak prevention.
   - `secure-communication.test.mjs`: Tests payload serialization firewall and HTTPS transport.
4. **Model Providers & Remote Reasoning**:
   - `groq-model-provider.test.mjs`: Tests Groq reasoning adapter and payload sanitization.
   - `remote-reasoning.test.mjs`: Tests recursive payload validators and response schema guards.
5. **Hardware Acceleration**:
   - `webgpu-acceleration.test.mjs`: Tests WebGPU manager and WASM fallback.
   - `onnx-runtime.test.mjs`: Tests ONNX session lifecycle and tensor safety.

---

## Running the Tests

```bash
# Run all privacy and core test suites
node scripts/check-privacy.mjs

# Run DOM action and observability suites
node --test tests/generic-dom-actions.test.mjs tests/observability-backend.test.mjs

# Run model integration tests
node --test tests/content-pii-scan.test.mjs tests/groq-model-provider.test.mjs
```
