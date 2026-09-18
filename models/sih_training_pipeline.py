"""
SIH 2026 — PII Detection Training Pipeline
Models: YOLOv8 (face, card, document, password field detection)
        ViT (browser screenshot context classification)
Hardware: Mac Metal (MPS) / Google Colab (CUDA)
Author: Generated for Shahrukh's SIH team

DATASETS USED:
1. WIDER FACE          — face detection (open source, direct download)
2. MIDV-500            — ID/document detection (open source)
3. Synthetic cards     — generated via Faker (no real card data needed)
4. WebSRC              — browser screenshot understanding (Stanford, HuggingFace)
5. Mind2Web            — browser interaction screenshots (HuggingFace)

RUN ORDER:
  python sih_training_pipeline.py --stage download
  python sih_training_pipeline.py --stage preprocess
  python sih_training_pipeline.py --stage train_yolo
  python sih_training_pipeline.py --stage train_vit
  python sih_training_pipeline.py --stage export
"""

import os
import sys
import argparse
import subprocess
import zipfile
import shutil
import random
import json
from pathlib import Path

# ─────────────────────────────────────────────
# DIRECTORY STRUCTURE
# ─────────────────────────────────────────────
SCRIPT_DIR      = Path(__file__).resolve().parent
WORKSPACE_ROOT  = SCRIPT_DIR.parent
BASE_DIR        = WORKSPACE_ROOT / "sih_pipeline"
RAW_DIR         = BASE_DIR / "raw"
PROCESSED_DIR   = BASE_DIR / "processed"
YOLO_DIR        = BASE_DIR / "yolo_dataset"
VIT_DIR         = BASE_DIR / "vit_dataset"
MODELS_DIR      = BASE_DIR / "models"
EXPORTS_DIR     = BASE_DIR / "exports"

for d in [RAW_DIR, PROCESSED_DIR, YOLO_DIR, VIT_DIR, MODELS_DIR, EXPORTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# ─────────────────────────────────────────────
# INSTALL DEPENDENCIES
# ─────────────────────────────────────────────
def install_dependencies():
    packages = [
        "ultralytics",          # YOLOv8
        "transformers",         # ViT
        "torch",                # PyTorch core
        "torchvision",          # PyTorch Vision
        "Pillow",               # Image processing
        "faker",                # Synthetic data generation
        "opencv-python",        # Image manipulation
        "albumentations",       # Augmentation
        "datasets",             # HuggingFace datasets
        "scikit-learn",         # Train/val split
        "matplotlib",           # Visualization
        "gdown",                # Google Drive downloads
        "requests",             # HTTP downloads
        "tqdm",                 # Progress bars
        "onnx",                 # ONNX export & verification
        "onnxruntime",          # ONNX inference check
    ]
    print("Installing dependencies...")
    for pkg in packages:
        print(f"  -> Installing {pkg}...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", pkg, "-q"],
            check=False
        )
    print("All dependencies checked.")

# ─────────────────────────────────────────────
# STAGE 1 — DOWNLOAD DATASETS
# ─────────────────────────────────────────────
def download_datasets():
    print("\n=== STAGE 1: DOWNLOADING DATASETS ===\n")
    _download_wider_face()
    _download_midv500()
    _generate_synthetic_cards()
    _download_websrc()
    _download_mind2web()

def _download_wider_face():
    """
    WIDER FACE dataset — face detection
    Source: http://shuoyang1213.me/WIDERFACE/
    Mirror: HuggingFace — wider_face
    Labels: bounding boxes around faces
    """
    print("[1/5] Downloading WIDER FACE...")
    save_dir = RAW_DIR / "wider_face"
    save_dir.mkdir(exist_ok=True)

    try:
        from datasets import load_dataset
        # This dataset exists on HuggingFace as 'wider_face'
        ds = load_dataset("wider_face", split="train", trust_remote_code=True)
        ds.save_to_disk(str(save_dir / "hf_cache"))
        print(f"  WIDER FACE downloaded: {len(ds)} images")
    except Exception as e:
        print(f"  HuggingFace download failed: {e}")
        print("  FALLBACK: Download manually from http://shuoyang1213.me/WIDERFACE/")
        print("  Place WIDER_train_dataset.zip in:", save_dir)
        print("  Then re-run this stage.")

def _download_midv500():
    """
    MIDV-500 — ID documents, passports, driver licenses
    Source: https://arxiv.org/abs/1807.05786
    Direct download available via their official page
    NOTE: If URL is broken, use MIDV-2020 as alternative
    """
    print("[2/5] Downloading MIDV-500 documents dataset...")
    save_dir = RAW_DIR / "midv500"
    save_dir.mkdir(exist_ok=True)

    import requests
    # Primary URL — if this fails, use the fallback
    primary_url = "https://raw.githubusercontent.com/fcakyon/midv500/main/README.md"
    fallback_message = """
    MIDV-500 manual download:
    1. Go to: https://github.com/fcakyon/midv500
    2. pip install midv500
    3. python -c "import midv500; midv500.download()"
    Place downloaded data in: sih_pipeline/raw/midv500/
    """
    try:
        # Try pip package first
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "midv500", "-q"],
            check=True
        )
        import midv500 as m500
        m500.download(save_dir=str(save_dir))
        print(f"  MIDV-500 downloaded to {save_dir}")
    except Exception as e:
        print(f"  MIDV-500 auto-download failed: {e}")
        print(fallback_message)
        # Create placeholder so pipeline continues
        (save_dir / "DOWNLOAD_MANUALLY.txt").write_text(fallback_message)

def _generate_synthetic_cards():
    """
    Synthetic credit card images — generated locally
    No real card data used
    Uses Faker to generate realistic card numbers/names
    Overlays text on blank card templates
    """
    print("[3/5] Generating synthetic credit card images...")
    from faker import Faker
    from PIL import Image, ImageDraw, ImageFont
    import random

    fake = Faker()
    save_dir = RAW_DIR / "synthetic_cards"
    save_dir.mkdir(exist_ok=True)
    labels_dir = save_dir / "labels"
    images_dir = save_dir / "images"
    labels_dir.mkdir(exist_ok=True)
    images_dir.mkdir(exist_ok=True)

    # Card colors — common bank card colors
    card_colors = [
        (26, 35, 126),    # dark blue
        (183, 28, 28),    # dark red
        (27, 94, 32),     # dark green
        (62, 62, 62),     # dark grey
        (74, 20, 140),    # purple
    ]

    num_cards = 1000  # generate 1000 synthetic cards
    print(f"  Generating {num_cards} synthetic card images...")

    for i in range(num_cards):
        # Card dimensions (standard credit card ratio)
        W, H = 640, 400
        img = Image.new("RGB", (W, H), color=random.choice(card_colors))
        draw = ImageDraw.Draw(img)

        # Generate fake card data
        card_number = fake.credit_card_number(card_type=None)
        card_number_display = " ".join([
            card_number[j:j+4] for j in range(0, 16, 4)
        ])
        cardholder = fake.name().upper()
        expiry = fake.credit_card_expire()

        # Draw card elements
        # Card number — center of card
        cn_x, cn_y = 60, 200
        draw.text((cn_x, cn_y), card_number_display,
                  fill=(255, 255, 255), font=None)

        # Cardholder name
        name_x, name_y = 60, 300
        draw.text((name_x, name_y), cardholder,
                  fill=(255, 255, 255), font=None)

        # Expiry
        exp_x, exp_y = 60, 340
        draw.text((exp_x, exp_y), f"VALID THRU {expiry}",
                  fill=(200, 200, 200), font=None)

        # Chip rectangle
        draw.rectangle([60, 120, 140, 180], fill=(218, 165, 32))

        # Save image
        img_path = images_dir / f"card_{i:04d}.jpg"
        img.save(img_path)

        # YOLO label format: class x_center y_center width height (normalized)
        # class 0 = card_number, class 1 = cardholder_name, class 2 = expiry
        with open(labels_dir / f"card_{i:04d}.txt", "w") as f:
            # Card number bounding box (normalized)
            f.write(f"0 {(cn_x + 150)/W:.4f} {(cn_y + 15)/H:.4f} {300/W:.4f} {30/H:.4f}\n")
            # Cardholder name
            f.write(f"1 {(name_x + 100)/W:.4f} {(name_y + 10)/H:.4f} {200/W:.4f} {20/H:.4f}\n")
            # Expiry
            f.write(f"2 {(exp_x + 80)/W:.4f} {(exp_y + 10)/H:.4f} {160/W:.4f} {20/H:.4f}\n")

    print(f"  Generated {num_cards} synthetic card images with YOLO labels")

def _download_websrc():
    """
    WebSRC — Web-Based Structural Reading Comprehension
    Source: Stanford / HuggingFace
    Contains browser screenshots with structured understanding
    Used for ViT context classification
    """
    print("[4/5] Downloading WebSRC browser screenshots...")
    save_dir = RAW_DIR / "websrc"
    save_dir.mkdir(exist_ok=True)

    try:
        from datasets import load_dataset
        # WebSRC exists on HuggingFace
        ds = load_dataset("WebSRC/websrc", split="train[:2000]",
                         trust_remote_code=True)
        ds.save_to_disk(str(save_dir / "hf_cache"))
        print(f"  WebSRC downloaded: {len(ds)} samples")
    except Exception as e:
        print(f"  WebSRC download failed: {e}")
        print("  Manual: https://x-lance.github.io/WebSRC/")
        (save_dir / "DOWNLOAD_MANUALLY.txt").write_text(
            "Download from: https://x-lance.github.io/WebSRC/"
        )

def _download_mind2web():
    """
    Mind2Web — browser agent interaction dataset
    Source: Ohio State University / HuggingFace
    Contains browser screenshots of real web tasks
    Used for ViT understanding of page context
    """
    print("[5/5] Downloading Mind2Web browser interaction dataset...")
    save_dir = RAW_DIR / "mind2web"
    save_dir.mkdir(exist_ok=True)

    try:
        from datasets import load_dataset
        # Mind2Web on HuggingFace
        ds = load_dataset("osunlp/Mind2Web", split="train[:2000]",
                         trust_remote_code=True)
        ds.save_to_disk(str(save_dir / "hf_cache"))
        print(f"  Mind2Web downloaded: {len(ds)} samples")
    except Exception as e:
        print(f"  Mind2Web download failed: {e}")
        print("  Manual: https://huggingface.co/datasets/osunlp/Mind2Web")
        (save_dir / "DOWNLOAD_MANUALLY.txt").write_text(
            "Download from: https://huggingface.co/datasets/osunlp/Mind2Web"
        )

# ─────────────────────────────────────────────
# STAGE 2 — PREPROCESS
# ─────────────────────────────────────────────
def preprocess():
    print("\n=== STAGE 2: PREPROCESSING ===\n")
    _preprocess_wider_face_to_yolo()
    _preprocess_midv500_to_yolo()
    _merge_yolo_datasets()
    _preprocess_vit_data()

def _preprocess_wider_face_to_yolo():
    """
    Convert WIDER FACE HuggingFace format to YOLO format
    YOLO format: class x_center y_center width height (all normalized 0-1)
    class 3 = face
    """
    print("[1/4] Converting WIDER FACE to YOLO format...")
    raw_dir = RAW_DIR / "wider_face" / "hf_cache"
    out_images = PROCESSED_DIR / "wider_face" / "images"
    out_labels = PROCESSED_DIR / "wider_face" / "labels"
    out_images.mkdir(parents=True, exist_ok=True)
    out_labels.mkdir(parents=True, exist_ok=True)

    if not raw_dir.exists():
        print("  WIDER FACE not downloaded yet. Skipping.")
        return

    try:
        from datasets import load_from_disk
        from PIL import Image as PILImage
        import io

        ds = load_from_disk(str(raw_dir))
        count = 0
        for idx, sample in enumerate(ds):
            if idx >= 5000:  # limit to 5000 for Mac Metal
                break
            try:
                img = sample["image"]
                if not isinstance(img, PILImage.Image):
                    continue

                W, H = img.size
                img_name = f"face_{idx:05d}.jpg"
                img.save(out_images / img_name)

                faces = sample.get("faces", {})
                bboxes = faces.get("bbox", [])

                label_lines = []
                for bbox in bboxes:
                    # WIDER FACE bbox format: [x, y, w, h] in pixels
                    x, y, w, h = bbox
                    x_center = (x + w / 2) / W
                    y_center = (y + h / 2) / H
                    w_norm = w / W
                    h_norm = h / H
                    # Skip invalid boxes
                    if w_norm <= 0 or h_norm <= 0:
                        continue
                    # Clamp to 0-1
                    x_center = max(0, min(1, x_center))
                    y_center = max(0, min(1, y_center))
                    w_norm   = max(0, min(1, w_norm))
                    h_norm   = max(0, min(1, h_norm))
                    label_lines.append(
                        f"3 {x_center:.4f} {y_center:.4f} {w_norm:.4f} {h_norm:.4f}"
                    )

                with open(out_labels / f"face_{idx:05d}.txt", "w") as f:
                    f.write("\n".join(label_lines))
                count += 1
            except Exception:
                continue

        print(f"  Converted {count} WIDER FACE images to YOLO format")
    except Exception as e:
        print(f"  Preprocessing WIDER FACE failed: {e}")

def _preprocess_midv500_to_yolo():
    """
    Convert MIDV-500 to YOLO format
    class 4 = id_document
    """
    print("[2/4] Converting MIDV-500 to YOLO format...")
    raw_dir = RAW_DIR / "midv500"
    out_images = PROCESSED_DIR / "midv500" / "images"
    out_labels = PROCESSED_DIR / "midv500" / "labels"
    out_images.mkdir(parents=True, exist_ok=True)
    out_labels.mkdir(parents=True, exist_ok=True)

    # Check if midv500 was downloaded
    image_files = list(raw_dir.rglob("*.jpg")) + list(raw_dir.rglob("*.png"))
    if not image_files:
        print("  MIDV-500 not downloaded. Skipping.")
        return

    from PIL import Image as PILImage
    count = 0
    for img_path in image_files[:2000]:  # limit for Mac Metal
        try:
            img = PILImage.open(img_path)
            W, H = img.size
            img_name = f"doc_{count:05d}.jpg"
            img.save(out_images / img_name)

            # MIDV-500 documents fill most of the image
            # Use full-image bounding box as approximation
            # Real annotation parsing depends on their JSON format
            with open(out_labels / f"doc_{count:05d}.txt", "w") as f:
                f.write(f"4 0.5000 0.5000 0.9000 0.9000\n")
            count += 1
        except Exception:
            continue

    print(f"  Converted {count} MIDV-500 images to YOLO format")

def _merge_yolo_datasets():
    """
    Merge all YOLO datasets into one unified dataset
    Classes:
        0 = card_number
        1 = cardholder_name
        2 = expiry_date
        3 = face
        4 = id_document
        5 = password_field  (from DOM — synthetic)
    Create train/val/test split: 80/10/10
    """
    print("[3/4] Merging all YOLO datasets and creating train/val/test split...")
    from sklearn.model_selection import train_test_split

    all_images = []

    # Collect from each preprocessed source
    sources = [
        PROCESSED_DIR / "wider_face" / "images",
        PROCESSED_DIR / "midv500" / "images",
        RAW_DIR / "synthetic_cards" / "images",
    ]

    for src in sources:
        if src.exists():
            imgs = list(src.glob("*.jpg")) + list(src.glob("*.png"))
            all_images.extend(imgs)

    if not all_images:
        print("  No images found to merge. Run download stage first.")
        return

    random.shuffle(all_images)
    train, temp = train_test_split(all_images, test_size=0.2, random_state=42)
    val, test   = train_test_split(temp, test_size=0.5, random_state=42)

    splits = {"train": train, "val": val, "test": test}

    for split_name, split_imgs in splits.items():
        img_out = YOLO_DIR / split_name / "images"
        lbl_out = YOLO_DIR / split_name / "labels"
        img_out.mkdir(parents=True, exist_ok=True)
        lbl_out.mkdir(parents=True, exist_ok=True)

        for img_path in split_imgs:
            # Copy image
            shutil.copy(img_path, img_out / img_path.name)
            # Copy corresponding label
            label_path = img_path.parent.parent / "labels" / (img_path.stem + ".txt")
            if label_path.exists():
                shutil.copy(label_path, lbl_out / label_path.name)
            else:
                # Create empty label if missing
                (lbl_out / (img_path.stem + ".txt")).write_text("")

    # Write YOLO dataset YAML
    yaml_content = f"""
path: {YOLO_DIR.absolute()}
train: train/images
val: val/images
test: test/images

nc: 6
names:
  0: card_number
  1: cardholder_name
  2: expiry_date
  3: face
  4: id_document
  5: password_field
"""
    (YOLO_DIR / "dataset.yaml").write_text(yaml_content.strip())
    print(f"  Merged dataset: {len(train)} train, {len(val)} val, {len(test)} test")
    print(f"  YAML saved to: {YOLO_DIR / 'dataset.yaml'}")

def _preprocess_vit_data():
    """
    Prepare ViT classification dataset from browser screenshots
    Classes:
        0 = safe_page       (no PII visible)
        1 = pii_present     (PII visible, needs redaction)
        2 = form_page       (form with sensitive fields)
        3 = payment_page    (payment / card page)
    """
    print("[4/4] Preprocessing ViT browser screenshot data...")
    vit_images = VIT_DIR / "images"
    vit_images.mkdir(parents=True, exist_ok=True)

    labels = {}

    # Process Mind2Web screenshots
    mind2web_dir = RAW_DIR / "mind2web" / "hf_cache"
    if mind2web_dir.exists():
        try:
            from datasets import load_from_disk
            from PIL import Image as PILImage

            ds = load_from_disk(str(mind2web_dir))
            count = 0
            for idx, sample in enumerate(ds):
                if idx >= 2000:
                    break
                try:
                    # Mind2Web has screenshots in different formats
                    # Check what keys are available
                    if "screenshot" in sample:
                        img_data = sample["screenshot"]
                    elif "image" in sample:
                        img_data = sample["image"]
                    else:
                        continue

                    if isinstance(img_data, PILImage.Image):
                        img = img_data
                    else:
                        continue

                    img_name = f"vit_m2w_{idx:05d}.jpg"
                    img.save(vit_images / img_name)

                    # Assign label based on task type
                    task = str(sample.get("task", "")).lower()
                    if any(w in task for w in ["pay", "card", "checkout", "billing"]):
                        labels[img_name] = 3  # payment_page
                    elif any(w in task for w in ["login", "register", "password", "email"]):
                        labels[img_name] = 2  # form_page
                    else:
                        labels[img_name] = 0  # safe_page
                    count += 1
                except Exception:
                    continue
            print(f"  Processed {count} Mind2Web screenshots for ViT")
        except Exception as e:
            print(f"  Mind2Web ViT preprocessing failed: {e}")

    # Save labels JSON
    with open(VIT_DIR / "labels.json", "w") as f:
        json.dump(labels, f, indent=2)

    print(f"  ViT dataset: {len(labels)} labeled screenshots")
    print(f"  Labels: 0=safe, 1=pii_present, 2=form_page, 3=payment_page")

# ─────────────────────────────────────────────
# STAGE 3 — TRAIN YOLO
# ─────────────────────────────────────────────
def train_yolo():
    print("\n=== STAGE 3: TRAINING YOLOv8 ===\n")

    import torch
    from ultralytics import YOLO

    yaml_path = YOLO_DIR / "dataset.yaml"
    if not yaml_path.exists():
        print("Dataset YAML not found. Run preprocess stage first.")
        return

    # Detect device
    if torch.backends.mps.is_available():
        device = "mps"
        print("Using Mac Metal (MPS)")
    elif torch.cuda.is_available():
        device = "0"
        print("Using CUDA GPU")
    else:
        device = "cpu"
        print("WARNING: Using CPU — this will be slow")

    # Use YOLOv8n (nano) — fastest, best for browser deployment
    model = YOLO("yolov8n.pt")

    print("Starting YOLO training...")
    print("Estimated time on Mac Metal: 2-4 hours for 50 epochs")

    results = model.train(
        data=str(yaml_path),
        epochs=50,              # enough for hackathon
        imgsz=640,
        batch=8,                # small batch for Mac Metal
        device=device,
        project=str(MODELS_DIR),
        name="yolo_pii_detector",
        patience=10,            # early stopping
        save=True,
        plots=True,
        verbose=True,
        # Augmentation
        flipud=0.0,             # no vertical flip for screenshots
        fliplr=0.5,
        mosaic=0.5,
        mixup=0.1,
    )

    print(f"\nYOLO training complete.")
    print(f"Best model: {MODELS_DIR}/yolo_pii_detector/weights/best.pt")
    return results

# ─────────────────────────────────────────────
# STAGE 4 — TRAIN ViT
# ─────────────────────────────────────────────
def train_vit():
    print("\n=== STAGE 4: TRAINING ViT ===\n")

    import torch
    from torch.utils.data import Dataset, DataLoader
    from transformers import ViTForImageClassification, ViTImageProcessor
    from PIL import Image as PILImage
    import json

    labels_file = VIT_DIR / "labels.json"
    if not labels_file.exists():
        print("ViT labels not found. Run preprocess stage first.")
        return

    with open(labels_file) as f:
        labels = json.load(f)

    if len(labels) < 10:
        print("Not enough ViT training data. Check Mind2Web download.")
        return

    # Detect device
    if torch.backends.mps.is_available():
        device = torch.device("mps")
        print("Using Mac Metal (MPS)")
    elif torch.cuda.is_available():
        device = torch.device("cuda")
        print("Using CUDA GPU")
    else:
        device = torch.device("cpu")
        print("WARNING: Using CPU")

    # Custom Dataset
    class BrowserScreenshotDataset(Dataset):
        def __init__(self, image_dir, labels_dict, processor):
            self.image_dir = Path(image_dir)
            self.items = list(labels_dict.items())
            self.processor = processor

        def __len__(self):
            return len(self.items)

        def __getitem__(self, idx):
            img_name, label = self.items[idx]
            img_path = self.image_dir / img_name
            try:
                img = PILImage.open(img_path).convert("RGB")
                inputs = self.processor(images=img, return_tensors="pt")
                pixel_values = inputs["pixel_values"].squeeze(0)
                return pixel_values, torch.tensor(label, dtype=torch.long)
            except Exception:
                # Return blank image on error
                blank = PILImage.new("RGB", (224, 224), color=(128, 128, 128))
                inputs = self.processor(images=blank, return_tensors="pt")
                return inputs["pixel_values"].squeeze(0), torch.tensor(0)

    # Load pretrained ViT
    model_name = "google/vit-base-patch16-224"
    print(f"Loading pretrained ViT: {model_name}")
    processor = ViTImageProcessor.from_pretrained(model_name)

    num_labels = 4  # safe, pii_present, form_page, payment_page
    model = ViTForImageClassification.from_pretrained(
        model_name,
        num_labels=num_labels,
        ignore_mismatched_sizes=True
    )
    model = model.to(device)

    # Train/val split
    from sklearn.model_selection import train_test_split
    items = list(labels.items())
    train_items, val_items = train_test_split(items, test_size=0.2, random_state=42)

    train_dataset = BrowserScreenshotDataset(
        VIT_DIR / "images",
        dict(train_items),
        processor
    )
    val_dataset = BrowserScreenshotDataset(
        VIT_DIR / "images",
        dict(val_items),
        processor
    )

    train_loader = DataLoader(train_dataset, batch_size=8, shuffle=True)
    val_loader   = DataLoader(val_dataset, batch_size=8, shuffle=False)

    # Training loop
    optimizer = torch.optim.AdamW(model.parameters(), lr=2e-5)
    criterion = torch.nn.CrossEntropyLoss()

    best_val_acc = 0.0
    num_epochs = 10  # ViT fine-tuning needs fewer epochs

    print(f"Training ViT for {num_epochs} epochs...")

    for epoch in range(num_epochs):
        # Train
        model.train()
        train_loss = 0.0
        for pixel_values, label_batch in train_loader:
            pixel_values = pixel_values.to(device)
            label_batch  = label_batch.to(device)
            optimizer.zero_grad()
            outputs = model(pixel_values=pixel_values)
            loss = criterion(outputs.logits, label_batch)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()

        # Validate
        model.eval()
        correct = 0
        total = 0
        with torch.no_grad():
            for pixel_values, label_batch in val_loader:
                pixel_values = pixel_values.to(device)
                label_batch  = label_batch.to(device)
                outputs = model(pixel_values=pixel_values)
                preds = outputs.logits.argmax(dim=1)
                correct += (preds == label_batch).sum().item()
                total += label_batch.size(0)

        val_acc = correct / total if total > 0 else 0
        avg_loss = train_loss / len(train_loader)
        print(f"  Epoch {epoch+1}/{num_epochs} | Loss: {avg_loss:.4f} | Val Acc: {val_acc:.4f}")

        # Save best model
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            model.save_pretrained(str(MODELS_DIR / "vit_best"))
            processor.save_pretrained(str(MODELS_DIR / "vit_best"))
            print(f"  Saved best ViT model (val_acc={val_acc:.4f})")

    print(f"\nViT training complete. Best val accuracy: {best_val_acc:.4f}")
    print(f"Model saved to: {MODELS_DIR}/vit_best")

# ─────────────────────────────────────────────
# STAGE 5 — EXPORT TO ONNX (for browser)
# ─────────────────────────────────────────────
def export_models():
    print("\n=== STAGE 5: EXPORTING TO ONNX ===\n")
    _export_yolo_onnx()
    _export_vit_onnx()

def _export_yolo_onnx():
    """Export YOLOv8 to ONNX for use in browser via ONNX Runtime Web"""
    print("[1/2] Exporting YOLO to ONNX...")
    best_pt = MODELS_DIR / "yolo_pii_detector" / "weights" / "best.pt"
    if not best_pt.exists():
        print("  YOLO best.pt not found. Train first.")
        return

    from ultralytics import YOLO
    model = YOLO(str(best_pt))
    model.export(
        format="onnx",
        imgsz=640,
        simplify=True,          # simplify for browser
        opset=12,               # ONNX Runtime Web compatible opset
        dynamic=False,          # fixed size for browser
    )
    onnx_path = best_pt.parent / "best.onnx"
    shutil.copy(onnx_path, EXPORTS_DIR / "yolo_pii.onnx")
    print(f"  YOLO ONNX exported to: {EXPORTS_DIR}/yolo_pii.onnx")

def _export_vit_onnx():
    """Export ViT to ONNX for browser use"""
    print("[2/2] Exporting ViT to ONNX...")
    vit_dir = MODELS_DIR / "vit_best"
    if not vit_dir.exists():
        print("  ViT model not found. Train first.")
        return

    import torch
    from transformers import ViTForImageClassification, ViTImageProcessor

    model = ViTForImageClassification.from_pretrained(str(vit_dir))
    model.eval()

    dummy_input = torch.randn(1, 3, 224, 224)

    onnx_path = EXPORTS_DIR / "vit_context.onnx"
    torch.onnx.export(
        model,
        dummy_input,
        str(onnx_path),
        opset_version=14,
        input_names=["pixel_values"],
        output_names=["logits"],
        dynamic_axes={
            "pixel_values": {0: "batch_size"},
            "logits": {0: "batch_size"}
        }
    )
    print(f"  ViT ONNX exported to: {onnx_path}")
    print(f"\nBoth models ready for browser deployment:")
    print(f"  {EXPORTS_DIR}/yolo_pii.onnx   → load with onnxruntime-web")
    print(f"  {EXPORTS_DIR}/vit_context.onnx → load with onnxruntime-web")

# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SIH PII Detection Training Pipeline")
    parser.add_argument(
        "--stage",
        choices=["install", "download", "preprocess", "train_yolo", "train_vit", "export", "all"],
        required=True,
        help="Which stage to run"
    )
    args = parser.parse_args()

    if args.stage == "install" or args.stage == "all":
        install_dependencies()
    if args.stage == "download" or args.stage == "all":
        download_datasets()
    if args.stage == "preprocess" or args.stage == "all":
        preprocess()
    if args.stage == "train_yolo" or args.stage == "all":
        train_yolo()
    if args.stage == "train_vit" or args.stage == "all":
        train_vit()
    if args.stage == "export" or args.stage == "all":
        export_models()