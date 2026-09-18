# Local GLiNER Model Directory

This directory stores the on-device model assets for **GLiNER Small** (`gliner_small-v2.1` / `onnx-community/gliner_small-v2.1`).

## Model Details
- **Architecture**: Generalist Lightweight Named Entity Recognition (Bi-encoder / span representation with ONNX Runtime Web).
- **Target Entities**: `person`, `name`, `address`, `location`, `organization`, `company`, `passport`, `national_id`.
- **License**: Apache-2.0
- **Size**: ~40MB (INT8 quantized ONNX), ~150MB (FP32).
- **Runtime**: Local ONNX Runtime Web (`WASM` / `WebGPU`). 100% on-device inference with zero network requests.
