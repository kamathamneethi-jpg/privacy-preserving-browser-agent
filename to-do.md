# TODO & Roadmap Status

## Current Focus & System Status

The **Privacy-Preserving Browser Agent** is fully functional end-to-end:
- **Core Library**: `@privacy-agent/privacy-core` (309/309 passing tests).
- **Chrome Extension**: Manifest V3 extension in `apps/extension/` bundled via esbuild (`npm run build:extension`).
- **Live Terminal Logging Relay**: WebSocket log server streaming real-time browser agent pipeline logs (`npm run dev:logs`).
- **Autonomous Multi-Step Agent Loop**: Iterative perception-planning-action loop supporting multi-step eCommerce search, category filtering, checkboxes, product selection, and "Add to Cart" operations.
- **On-Device ML Pipeline**: Python training pipeline (`models/sih_training_pipeline.py`) for YOLOv8 (visual PII detection) and ViT (page context safety classification), exportable to ONNX Runtime Web.

---

## Critical Path Milestones

### Milestone 1: Zero-Leakage Privacy Core [COMPLETED]
- [x] On-Device DOM + PII detection and classification (`packages/privacy-core`).
- [x] Tokenization & vault secret management (`privacy-policy-engine.js`, `secure-privacy-vault.js`).
- [x] Secure Communication Client blocking all raw secrets, raw DOM, and image buffers over the wire.
- [x] WebGPU hardware acceleration with CPU/WASM fallback.
- [x] 309 automated privacy unit & integration tests passing.

### Milestone 2: Chrome Extension Integration [COMPLETED]
- [x] Manifest V3 architecture with `"scripting"`, `"storage"`, and `<all_urls>` permissions.
- [x] ESBuild bundler injecting `.env` variables (`GROQ_API_KEY`, `GROQ_MODEL`, `OPENROUTER_API_KEY`) into build artifacts.
- [x] Resilient tab messaging with programmatic `chrome.scripting.executeScript` fallback.
- [x] Interactive popup interface with settings toggle, PII detection badges, and live action feedback.

### Milestone 3: Generic DOM Perception & Autonomous Multi-Step Execution [COMPLETED]
- [x] Dynamic DOM element discovery assigning opaque IDs (`el_1`, `el_2`, ...) and bounding boxes.
- [x] Checkbox, radio button, and eCommerce filter detection (`.a-checkbox-label`, `li[id^="p_"] a`).
- [x] Multi-step Re-Act agent loop (`MAX_STEPS = 6`) in `popup.js` with DOM settlement pauses.
- [x] Auto-navigation from internal browser tabs (`chrome://newtab`, `about:blank`) or requested URLs.
- [x] eCommerce intent disambiguation (search query keyword isolation vs. Add to Cart / Buy Now actions).

### Milestone 4: Remote Model Reasoning & Live Terminal Observability [COMPLETED]
- [x] Hugging Face free serverless inference adapter with `Qwen/Qwen3-VL-4B-Instruct` (Free Visual Agent model).
- [x] OpenRouter free-tier adapter (`qwen/qwen-2.5-vl-72b-instruct:free`, `google/gemma-2-9b-it:free`) and Groq adapter (`llama-3.3-70b-versatile`).
- [x] Local On-Device Heuristic Planner fallback (zero API key, zero egress, 100% free).
- [x] Live terminal log relay (`scripts/extension-log-server.mjs`) streaming pipeline events.
- [x] Authoritative local action execution (`CLICK`, `TYPE`, `CHECK`, `SELECT`, `PRESS_KEY`, `SUBMIT`).

### Milestone 5: On-Device Vision ML Training Pipeline [COMPLETED]
- [x] Created `models/sih_training_pipeline.py` with 5 executable stages:
  - `install`: Dependencies installation (YOLOv8, ViT, PyTorch, ONNX).
  - `download`: WIDER FACE, MIDV-500, Synthetic cards, WebSRC, Mind2Web.
  - `preprocess`: YOLO annotation format converter and ViT dataset generator.
  - `train_yolo`: YOLOv8n visual PII / document / card detector (MPS/CUDA/CPU).
  - `train_vit`: ViT page context safety classifier.
  - `export`: ONNX export for on-device browser deployment via ONNX Runtime Web.

---

## Next Enhancement Items

- [ ] **Physical ONNX Model Binaries in Extension Package**: Package trained `yolo_pii.onnx` and `vit_context.onnx` directly into `apps/extension/` for local inference.
- [ ] **Voice Input for Agent Tasks**: Add Web Speech API integration in extension popup.
- [ ] **History & Audit Log Export**: Allow users to download JSON audit logs of masked PII and executed browser actions.

