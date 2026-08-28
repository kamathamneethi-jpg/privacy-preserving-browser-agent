# Privacy-Preserving Browser Agent

SIH 2026 project: a Chrome/Chromium browser agent that understands webpages while keeping sensitive information on the user's device.

## MVP privacy rule

Raw sensitive data must not be sent to the remote reasoning service. The extension will detect sensitive content locally and apply one of three decisions before sharing page context:

- `REDACT` — replace the value with a hidden marker.
- `TOKENIZE` — replace the value with a local reference such as `{{EMAIL_1}}`.
- `LOCAL_ONLY` — keep the value entirely on the device; only the extension may use it for a user-authorized browser action.

## Repository layout

```text
apps/extension/             Chrome/Chromium extension (capture and browser actions)
services/reasoning-backend/ Remote service that receives only sanitized context
packages/privacy-core/      On-device detection and privacy-policy logic
packages/shared-types/      Types shared by the extension and backend
docs/                       Design notes and decisions
tests/                      Cross-package tests
sources/                    Read-only ChatGPT project references
```

## Development roadmap

1. Project structure and initial files (complete)
2. Minimal Chrome extension that can capture page metadata (current step)
3. Local privacy policy engine with safe defaults
4. DOM-based PII detection and tokenization
5. Screenshot/OCR and ONNX Runtime Web integration
6. Sanitized remote reasoning API
7. User-authorized browser actions and end-to-end tests

## Safety boundary

The backend must accept only sanitized page context and must never receive the local privacy-vault contents.
