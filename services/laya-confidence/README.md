# Local Laya Confidence Service (v2)

This service provides an **on-device, non-autoregressive ML confidence layer** on top of the deterministic rule-based `PolicyEngine`.

## Architecture & Guarantees
- **100% Offline**: Binds strictly to loopback `127.0.0.1:8766`. Zero outbound telemetry or external requests.
- **Advisory Role**: Serves strictly as a calibrated confidence estimator. The rule engine remains 100% authoritative.
- **Fast Execution**: Supports single-field scoring (`POST /score`) and batched scoring (`POST /score-batch`).
- **Temperature Calibrated**: Probabilities are scaled with temperature $T^*$ fitted on the calibration split to minimize Expected Calibration Error (ECE).
- **Empirical Threshold $\theta^*$**: Disagreement flags are raised only when confidence exceeds the empirically optimized cutoff $\theta^*$.

## Endpoints
- `GET /health`: Health and offline verification.
- `POST /score`: Takes `{ "state": { ... }, "options": ["ALLOW", "TOKENIZE", "REDACT", "LOCAL_ONLY"] }`.
- `POST /score-batch`: Takes `{ "items": [ { "state": ..., "options": ... }, ... ] }`.
