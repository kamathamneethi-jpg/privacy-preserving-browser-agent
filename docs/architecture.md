# Architecture decisions

## Trust boundary

The browser extension and privacy core run locally. Raw page content, detected PII, and the local privacy vault stay on the device. Only a sanitized representation may cross to the remote reasoning backend.

## Planned data flow

```text
Web page → extension capture → local PII detection → privacy policy → sanitized context → remote reasoning
                                                               ↓
                                                        local privacy vault
```

## Default policy

If the system is uncertain whether a value is sensitive or required, it must keep the value local and ask the user before using it.

## Step 3 policy rules

The local privacy engine uses these rules before any later transport layer is allowed to handle a value:

1. Explicitly non-sensitive information may be allowed.
2. Sensitive information used in a user-authorized local browser action is `LOCAL_ONLY`.
3. Sensitive information needed only as a reference by remote reasoning is `TOKENIZE`; the remote side receives a token, not the raw value.
4. Every other sensitive or uncertain case is `REDACT`.
