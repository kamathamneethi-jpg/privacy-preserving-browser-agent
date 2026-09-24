import os
from pathlib import Path

# Local Service Network Config
HOST = os.environ.get("LAYA_HOST", "127.0.0.1")
PORT = int(os.environ.get("LAYA_PORT", "8766"))

# Root & Model Paths
BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent.parent
MODEL_DIR = REPO_ROOT / "models" / "laya-policy-checkpoint"
DEFAULT_BASE_MODEL = "convaiinnovations/laya"

# Device selection
import torch
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Latency and Timeout guards
# On GPU: 120ms; On CPU: 800ms
DEFAULT_TIMEOUT_MS = 120 if DEVICE == "cuda" else 800
TIMEOUT_MS = int(os.environ.get("LAYA_TIMEOUT_MS", str(DEFAULT_TIMEOUT_MS)))

# Supported 4-way Policy Decision Classes
POLICY_CLASSES = ["ALLOW", "TOKENIZE", "REDACT", "LOCAL_ONLY"]
