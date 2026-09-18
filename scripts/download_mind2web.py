import os
from pathlib import Path

from huggingface_hub import login, snapshot_download


# ============================================================
# HUGGING FACE TOKEN
# ============================================================

HF_TOKEN = "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"


# ============================================================
# PATHS
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parent.parent

OUTPUT_DIR = (
    PROJECT_ROOT
    / "datasets"
    / "Mind2Web"
)


# ============================================================
# CHECK TOKEN
# ============================================================

if (
    not HF_TOKEN
    or HF_TOKEN == "PASTE_YOUR_HUGGING_FACE_TOKEN_HERE"
):
    raise ValueError(
        "Paste your Hugging Face token into HF_TOKEN."
    )


# ============================================================
# LOGIN
# ============================================================

print("🔐 Logging into Hugging Face...")

login(
    token=HF_TOKEN,
    add_to_git_credential=False
)

print("✅ Login successful.")


# ============================================================
# CREATE DIRECTORY
# ============================================================

OUTPUT_DIR.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# DOWNLOAD TRAINING DATA ONLY
# ============================================================

print("\n📥 Downloading Mind2Web training data...")

snapshot_download(
    repo_id="osunlp/Mind2Web",
    repo_type="dataset",
    token=HF_TOKEN,

    local_dir=str(OUTPUT_DIR),

    allow_patterns=[
        "data/train/*.json"
    ],

    ignore_patterns=[
        "*.md",
        "README*",
        ".gitattributes",
        "test*",
        "*.zip",
        "*.pkl"
    ]
)


# ============================================================
# VERIFY
# ============================================================

TRAIN_DIR = (
    OUTPUT_DIR
    / "data"
    / "train"
)

files = sorted(
    TRAIN_DIR.glob("*.json")
)


print("\n========================================")
print("MIND2WEB TRAINING DATA")
print("========================================")

print(
    f"Files: {len(files)}"
)

for file in files:
    size_mb = (
        file.stat().st_size
        / (1024 ** 2)
    )

    print(
        f"{file.name:20s} "
        f"{size_mb:,.1f} MB"
    )


print("\nSaved to:")
print(TRAIN_DIR.resolve())

print("\n✅ Mind2Web training data downloaded.")
