# Privacy core

This package contains the local-only privacy policy engine.

It accepts a description of a detected value, never the raw value itself. Its safe default is `REDACT`.

## Decisions

- `ALLOW` — the value is known to be non-sensitive.
- `REDACT` — hide the value. This is the default for sensitive or uncertain data.
- `TOKENIZE` — replace a sensitive value with a local token before remote reasoning. The raw value remains on-device.
- `LOCAL_ONLY` — a user-authorized local browser action may use the value. It must not be sent remotely.

The policy module is not connected to the extension yet. That integration follows only after detection and local token-vault components are implemented.
