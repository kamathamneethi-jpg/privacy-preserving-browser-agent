# Privacy-Preserving Autonomous Browser Agent

> **Smart India Hackathon (SIH 2026)**
> A privacy-first browser agent that perceives webpages and executes autonomous multi-step tasks while keeping 100% of sensitive information and secrets strictly on the user's local device.

---

## 🔒 The Zero-Leakage Privacy Boundary

Raw sensitive data **NEVER** leaves the client's browser. The extension detects sensitive content locally and enforces strict on-device privacy decisions before sharing sanitized context with remote LLMs:

- **`REDACT`** — Replaces irrelevant sensitive data with opaque redaction markers.
- **`TOKENIZE`** — Replaces task-relevant sensitive fields with local abstract references (e.g. `{{EMAIL_1}}`, `{{PHONE_1}}`).
- **`LOCAL_ONLY`** — Retains high-security secrets (passwords, OTPs, credit cards) exclusively inside the local encrypted privacy vault. The remote AI receives only abstract actions.
- **Zero Raw Screenshots / Pixels**: Visual perception and OCR happen on-device. Raw image buffers are blocked from transmission.

---

## 🎯 WebPII Object Detection (YOLO11n Fine-Tuning)

This sub-project fine-tunes a pretrained **YOLO11n** (`yolo11n.pt`) detector for on-device detection of 16 categories of Personally Identifiable Information (PII) on rendered webpage screenshots.

### Key Experiment Details
- **Architecture**: Ultralytics **YOLO11n** (Nano) starting from pretrained `yolo11n.pt` weights (**fine-tuning**, not training from scratch).
- **Dataset**: `datasets/webpii_yolo/`
  - **Train**: 40,384 images, 40,384 labels (469,135 annotations)
  - **Test**: 4,481 images, 4,481 labels (51,715 annotations)
  - **Total**: 44,865 images, 520,850 annotations across 16 classes
- **16 PII Classes**:
  ```text
  0: NAME             4: LOCATION         8: SECURITY_CODE    12: GIFT_CODE
  1: EMAIL            5: POSTCODE         9: USERNAME         13: COMPANY
  2: PHONE            6: DATE_OF_BIRTH   10: PASSWORD         14: COUNTRY
  3: ADDRESS          7: PAYMENT_CARD    11: PROMO_CODE       15: OTHER_PII
  ```

---

## 💻 Workflows & Commands

### A. Mac Preparation Workflow (Validation Only — NO Training on Mac)

The Mac environment is strictly used for code writing, syntax verification, and dry runs. **Model training is NOT executed on macOS.**

```bash
# 1. Navigate to workspace
cd ~/Desktop/sih

# 2. Check environment (verifies Python, PyTorch, Ultralytics, YAML)
python3 scripts/check_environment.py

# 3. Verify dataset integrity (counts, 1-to-1 image-label pairs, coords, 16 classes)
python3 scripts/verify_dataset.py

# 4. Perform a dry run (loads config, validates parameters, DOES NOT train)
python3 scripts/train_yolo.py --dry-run
```

---

### B. NVIDIA RTX Laptop Workflow (GPU Training & Evaluation)

Copy the project repository and `datasets/webpii_yolo` to your NVIDIA RTX laptop.

#### 1. Setup Environment on RTX Laptop
```bash
cd /path/to/sih

# Install PyTorch with CUDA support (match your CUDA version, e.g. CUDA 12.1):
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# Install requirements
pip install -r requirements.txt
```

#### 2. Run Diagnostics & Pre-Flight
```bash
# Check GPU and CUDA availability
python scripts/check_environment.py

# Verify dataset structure
python scripts/verify_dataset.py

# Run RTX GPU pre-flight check (verifies GPU memory and checks all configs without training)
python scripts/train_yolo.py --preflight
```

#### 3. Execute Training
If pre-flight passes, start training:

```bash
# Default training (batch size 16):
python scripts/train_yolo.py --batch 16

# If CUDA Out-Of-Memory occurs, reduce batch size:
python scripts/train_yolo.py --batch 8

# If still Out-Of-Memory:
python scripts/train_yolo.py --batch 4
```

> Training outputs are saved under: `training/webpii_16class_yolo11n/`
> The main trained model weights are saved at: `training/webpii_16class_yolo11n/weights/best.pt`

#### 4. Evaluate Trained Model on Test Set
```bash
python scripts/evaluate_yolo.py
```
This loads `training/webpii_16class_yolo11n/weights/best.pt` and evaluates against the 4,481 test images in `images/test`, reporting overall and per-class Precision, Recall, mAP@50, and mAP@50-95, and saves results to `training/webpii_16class_yolo11n/evaluation/evaluation_summary.json`.

---

## 📁 Repository Layout

```text
apps/extension/             Chrome Extension (Manifest V3 popup, DOM perception, action runtime)
packages/privacy-core/      On-device PII detection, tokenization, vault, & DOM registry
services/reasoning-backend/ Sanitized remote reasoning adapter & payload validation
models/                     SIH 2026 On-device ML training pipeline
datasets/webpii_yolo/       44,865 image WebPII dataset in YOLO format (train: 40,384, test: 4,481)
scripts/                    Build tools, dataset verifier, training, and evaluation scripts
├── verify_dataset.py       Non-destructive dataset integrity checker
├── check_environment.py    Cross-platform hardware & CUDA diagnostic tool
├── train_yolo.py           GPU training runner with --dry-run and --preflight safety modes
└── evaluate_yolo.py        Full test-split metric evaluator (mAP50, mAP50-95, per-class)
tests/                      309+ automated privacy, security, and DOM action test suites
```

---

## 📖 Key Documentation

- **[`AGENTS.md`](file:///Users/shahrukh/Desktop/sih/AGENTS.md)** — Master guide, architectural invariants, and reading order for AI models.
- **[`to-do.md`](file:///Users/shahrukh/Desktop/sih/to-do.md)** — Active roadmap and task status.
- **[`progress.md`](file:///Users/shahrukh/Desktop/sih/progress.md)** — Detailed historical changelog.
- **[`DEMO_WALKTHROUGH.md`](file:///Users/shahrukh/Desktop/sih/DEMO_WALKTHROUGH.md)** — Step-by-step verification flows.
