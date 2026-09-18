#!/usr/bin/env python3
"""
WebPII YOLO Dataset Verification Script
Verifies dataset integrity, directory structure, annotation counts, 
class schema, and label coordinate boundaries without modifying any files.
"""

import sys
import os
from pathlib import Path
import yaml

EXPECTED_CLASSES = [
    "NAME",
    "EMAIL",
    "PHONE",
    "ADDRESS",
    "LOCATION",
    "POSTCODE",
    "DATE_OF_BIRTH",
    "PAYMENT_CARD",
    "SECURITY_CODE",
    "USERNAME",
    "PASSWORD",
    "PROMO_CODE",
    "GIFT_CODE",
    "COMPANY",
    "COUNTRY",
    "OTHER_PII"
]

EXPECTED_COUNTS = {
    "train_images": 40384,
    "train_labels": 40384,
    "test_images": 4481,
    "test_labels": 4481,
}

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}

def find_project_root() -> Path:
    # Resolve project root relative to this script location (scripts/ -> project_root)
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    return project_root

def verify_dataset(dataset_dir: Path = None) -> bool:
    print("=" * 65)
    print("      WEBPII YOLO DATASET INTEGRITY VERIFIER")
    print("=" * 65)
    
    if dataset_dir is None:
        project_root = find_project_root()
        dataset_dir = project_root / "datasets" / "webpii_yolo"
    
    print(f"Dataset Root: {dataset_dir.resolve()}")
    errors = []
    
    # A. Dataset root exists
    if not dataset_dir.exists():
        errors.append(f"Dataset root directory does not exist: {dataset_dir}")
        print(f"[FAIL] Dataset root not found: {dataset_dir}")
        print("\n" + "=" * 65)
        print("DATASET VERIFICATION FAILED")
        print("=" * 65)
        return False
    print("[PASS] Dataset root exists.")

    # B. data.yaml exists
    data_yaml_path = dataset_dir / "data.yaml"
    if not data_yaml_path.is_file():
        errors.append(f"data.yaml does not exist at {data_yaml_path}")
        print(f"[FAIL] data.yaml not found at: {data_yaml_path}")
    else:
        print(f"[PASS] data.yaml exists at: {data_yaml_path}")

    # C, D, E, F: Required directories
    images_train_dir = dataset_dir / "images" / "train"
    images_test_dir = dataset_dir / "images" / "test"
    labels_train_dir = dataset_dir / "labels" / "train"
    labels_test_dir = dataset_dir / "labels" / "test"

    for name, p in [
        ("images/train", images_train_dir),
        ("images/test", images_test_dir),
        ("labels/train", labels_train_dir),
        ("labels/test", labels_test_dir),
    ]:
        if not p.is_dir():
            errors.append(f"Required directory '{name}' does not exist at {p}")
            print(f"[FAIL] Directory missing: {name}")
        else:
            print(f"[PASS] Directory exists: {name}")

    if errors:
        print("\n" + "=" * 65)
        print("DATASET VERIFICATION FAILED")
        print("=" * 65)
        for err in errors:
            print(f" - {err}")
        return False

    # O, P, Q, R: Validate data.yaml content
    print("\nValidating data.yaml...")
    try:
        with open(data_yaml_path, "r", encoding="utf-8") as f:
            yaml_content = yaml.safe_load(f)
        
        # Check class count
        yaml_nc = yaml_content.get("nc")
        if yaml_nc != 16:
            errors.append(f"data.yaml 'nc' should be 16, found: {yaml_nc}")
            print(f"[FAIL] 'nc' count in data.yaml is {yaml_nc}, expected 16")
        else:
            print("[PASS] data.yaml nc = 16")

        # Check names
        names = yaml_content.get("names")
        if isinstance(names, dict):
            # Dict form {0: 'NAME', 1: 'EMAIL', ...}
            class_ids = sorted(list(names.keys()))
            if class_ids != list(range(16)):
                errors.append(f"data.yaml class IDs should be 0..15, found: {class_ids}")
            name_list = [names[i] for i in range(16) if i in names]
        elif isinstance(names, list):
            name_list = names
        else:
            errors.append(f"Invalid 'names' field in data.yaml: {type(names)}")
            name_list = []

        if len(name_list) != 16:
            errors.append(f"Expected 16 class names in data.yaml, found {len(name_list)}")
            print(f"[FAIL] Class names count in data.yaml: {len(name_list)}")
        else:
            mismatches = []
            for idx, (expected, actual) in enumerate(zip(EXPECTED_CLASSES, name_list)):
                if expected != actual:
                    mismatches.append(f"Index {idx}: expected '{expected}', found '{actual}'")
            if mismatches:
                for m in mismatches:
                    errors.append(f"data.yaml class mismatch: {m}")
                    print(f"[FAIL] {m}")
            else:
                print(f"[PASS] All 16 class names and order match exactly:")
                for idx, name in enumerate(EXPECTED_CLASSES):
                    print(f"       {idx:2d} -> {name}")

        # Check path portability
        yaml_path = str(yaml_content.get("path", ""))
        if "/content/drive" in yaml_path:
            errors.append(f"data.yaml contains Colab path: {yaml_path}")
            print(f"[FAIL] data.yaml contains legacy path: {yaml_path}")
        else:
            print(f"[PASS] data.yaml path is portable: '{yaml_path}'")

    except Exception as e:
        errors.append(f"Failed to read or parse data.yaml: {e}")
        print(f"[FAIL] Error parsing data.yaml: {e}")

    # G, H, I, J: Check file counts
    print("\nChecking image and label counts...")
    train_images = {p.stem: p for p in images_train_dir.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS}
    train_labels = {p.stem: p for p in labels_train_dir.iterdir() if p.is_file() and p.suffix == ".txt"}
    test_images = {p.stem: p for p in images_test_dir.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS}
    test_labels = {p.stem: p for p in labels_test_dir.iterdir() if p.is_file() and p.suffix == ".txt"}

    print(f"Train Images count: {len(train_images):,d} (expected {EXPECTED_COUNTS['train_images']:,d})")
    print(f"Train Labels count: {len(train_labels):,d} (expected {EXPECTED_COUNTS['train_labels']:,d})")
    print(f"Test Images count:  {len(test_images):,d} (expected {EXPECTED_COUNTS['test_images']:,d})")
    print(f"Test Labels count:  {len(test_labels):,d} (expected {EXPECTED_COUNTS['test_labels']:,d})")

    if len(train_images) != EXPECTED_COUNTS["train_images"]:
        errors.append(f"Train images count mismatch: found {len(train_images)}, expected {EXPECTED_COUNTS['train_images']}")
    if len(train_labels) != EXPECTED_COUNTS["train_labels"]:
        errors.append(f"Train labels count mismatch: found {len(train_labels)}, expected {EXPECTED_COUNTS['train_labels']}")
    if len(test_images) != EXPECTED_COUNTS["test_images"]:
        errors.append(f"Test images count mismatch: found {len(test_images)}, expected {EXPECTED_COUNTS['test_images']}")
    if len(test_labels) != EXPECTED_COUNTS["test_labels"]:
        errors.append(f"Test labels count mismatch: found {len(test_labels)}, expected {EXPECTED_COUNTS['test_labels']}")

    # K, L: Verify 1-to-1 matching for train split
    print("\nVerifying train image/label 1-to-1 correspondences...")
    missing_train_labels = set(train_images.keys()) - set(train_labels.keys())
    orphaned_train_labels = set(train_labels.keys()) - set(train_images.keys())

    if missing_train_labels:
        errors.append(f"Train images missing corresponding label file: {len(missing_train_labels)}")
        print(f"[FAIL] {len(missing_train_labels)} train images missing label file. Examples: {list(missing_train_labels)[:3]}")
    else:
        print("[PASS] Every train image has a corresponding label file.")

    if orphaned_train_labels:
        errors.append(f"Train labels missing corresponding image file: {len(orphaned_train_labels)}")
        print(f"[FAIL] {len(orphaned_train_labels)} train labels missing image file. Examples: {list(orphaned_train_labels)[:3]}")
    else:
        print("[PASS] Every train label has a corresponding image file.")

    # M, N: Verify 1-to-1 matching for test split
    print("\nVerifying test image/label 1-to-1 correspondences...")
    missing_test_labels = set(test_images.keys()) - set(test_labels.keys())
    orphaned_test_labels = set(test_labels.keys()) - set(test_images.keys())

    if missing_test_labels:
        errors.append(f"Test images missing corresponding label file: {len(missing_test_labels)}")
        print(f"[FAIL] {len(missing_test_labels)} test images missing label file. Examples: {list(missing_test_labels)[:3]}")
    else:
        print("[PASS] Every test image has a corresponding label file.")

    if orphaned_test_labels:
        errors.append(f"Test labels missing corresponding image file: {len(orphaned_test_labels)}")
        print(f"[FAIL] {len(orphaned_test_labels)} test labels missing image file. Examples: {list(orphaned_test_labels)[:3]}")
    else:
        print("[PASS] Every test label has a corresponding image file.")

    # S, T, U, V, W: Validate label format and coordinates
    print("\nScanning annotations across all label files...")
    splits_to_scan = [("train", labels_train_dir, train_labels), ("test", labels_test_dir, test_labels)]
    
    total_annotations = 0
    class_distribution = {i: 0 for i in range(16)}
    malformed_files = []

    for split_name, ldir, label_dict in splits_to_scan:
        split_ann_count = 0
        for stem, file_path in label_dict.items():
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    lines = f.readlines()
                
                for line_idx, line in enumerate(lines, 1):
                    line_str = line.strip()
                    if not line_str:
                        continue
                    parts = line_str.split()
                    if len(parts) != 5:
                        malformed_files.append((str(file_path), line_idx, f"Expected 5 values, got {len(parts)}: '{line_str}'"))
                        continue
                    
                    try:
                        cls_id = int(parts[0])
                        x_c = float(parts[1])
                        y_c = float(parts[2])
                        w = float(parts[3])
                        h = float(parts[4])
                    except ValueError as ve:
                        malformed_files.append((str(file_path), line_idx, f"Non-numeric value in label: {ve}"))
                        continue

                    # Validate class id in 0..15
                    if cls_id < 0 or cls_id > 15:
                        malformed_files.append((str(file_path), line_idx, f"Class ID {cls_id} out of bounds [0, 15]"))
                        continue

                    # Validate bounding box coordinates in [0, 1]
                    if not (0.0 <= x_c <= 1.0 and 0.0 <= y_c <= 1.0 and 0.0 <= w <= 1.0 and 0.0 <= h <= 1.0):
                        malformed_files.append((str(file_path), line_idx, f"Coords out of bounds [0, 1]: ({x_c}, {y_c}, {w}, {h})"))
                        continue

                    split_ann_count += 1
                    total_annotations += 1
                    class_distribution[cls_id] += 1

            except Exception as ex:
                malformed_files.append((str(file_path), 0, f"Error reading file: {ex}"))

        print(f"Split '{split_name}': {split_ann_count:,d} valid annotations verified.")

    print(f"\nTotal Annotations Verified: {total_annotations:,d}")
    print("Class Distribution across dataset:")
    for cid in range(16):
        cname = EXPECTED_CLASSES[cid]
        count = class_distribution[cid]
        pct = (count / total_annotations * 100) if total_annotations > 0 else 0
        print(f"  Class {cid:2d} ({cname:<15}): {count:7,d} ({pct:5.2f}%)")

    if malformed_files:
        errors.append(f"Found {len(malformed_files)} malformed annotations in label files.")
        print(f"\n[FAIL] Found {len(malformed_files)} malformed annotations! Sample errors:")
        for file_path, line_idx, msg in malformed_files[:5]:
            print(f"  - {file_path}:{line_idx} -> {msg}")
    else:
        print("\n[PASS] All label files contain perfectly formatted YOLO annotations (5 values, class 0..15, coords in [0, 1]).")

    # Summary
    print("\n" + "=" * 65)
    if errors:
        print("DATASET VERIFICATION FAILED")
        print("=" * 65)
        for err in errors:
            print(f" - {err}")
        return False
    else:
        print("DATASET VERIFICATION PASSED")
        print("=" * 65)
        return True

if __name__ == "__main__":
    success = verify_dataset()
    sys.exit(0 if success else 1)
