#!/usr/bin/env python3
"""
WebPII YOLO11n Test Evaluation Script
Loads trained weights (best.pt) and evaluates metrics on the test split (images/test).
Computes overall and per-class Precision, Recall, mAP50, and mAP50-95 for all 16 PII classes.
"""

import sys
import os
import json
import argparse
from pathlib import Path

CLASS_NAMES = [
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

def get_project_root() -> Path:
    return Path(__file__).resolve().parent.parent

def evaluate_model(weights_path: Path, data_yaml_path: Path, device: str = "0", batch: int = 16) -> bool:
    print("=" * 65)
    print("         WEBPII YOLO11n TEST EVALUATION PIPELINE")
    print("=" * 65)

    if not weights_path.is_file():
        print(f"ERROR: Trained model weights not found at: {weights_path}")
        print("\nPlease ensure model training has been completed on the RTX laptop first:")
        print("  python scripts/train_yolo.py --batch 16")
        print("\nExpected weights file:")
        print(f"  {weights_path.resolve()}")
        return False

    if not data_yaml_path.is_file():
        print(f"ERROR: data.yaml not found at: {data_yaml_path}")
        return False

    print(f"Weights:     {weights_path.resolve()}")
    print(f"Dataset:     {data_yaml_path.resolve()}")
    print("Evaluating Split: 'val' (which maps directly to images/test with 4,481 test images)")
    print(f"Device:      {device}")
    print(f"Batch Size:  {batch}")
    print("=" * 65 + "\n")

    try:
        from ultralytics import YOLO
    except ImportError:
        print("ERROR: Ultralytics is not installed. Run: pip install -r requirements.txt")
        return False

    print("Loading model weights...")
    model = YOLO(str(weights_path))

    print("\nRunning evaluation on test dataset split...")
    # split='val' uses the val dataset specified in data.yaml (which is images/test)
    metrics = model.val(
        data=str(data_yaml_path),
        split="val",
        batch=batch,
        device=device,
        save_json=True,
        verbose=True
    )

    # Extract metrics safely from Ultralytics box metrics
    box_metrics = metrics.box
    overall_p = float(getattr(box_metrics, 'mp', 0.0))
    overall_r = float(getattr(box_metrics, 'mr', 0.0))
    overall_map50 = float(getattr(box_metrics, 'map50', 0.0))
    overall_map50_95 = float(getattr(box_metrics, 'map', 0.0))

    print("\n" + "=" * 65)
    print("                  OVERALL TEST METRICS")
    print("=" * 65)
    print(f"  Overall Precision:  {overall_p:.4f} ({overall_p*100:.2f}%)")
    print(f"  Overall Recall:     {overall_r:.4f} ({overall_r*100:.2f}%)")
    print(f"  Overall mAP@50:     {overall_map50:.4f} ({overall_map50*100:.2f}%)")
    print(f"  Overall mAP@50-95:  {overall_map50_95:.4f} ({overall_map50_95*100:.2f}%)")

    # Per-class metrics
    per_class_results = []
    print("\n" + "=" * 65)
    print("             PER-CLASS EVALUATION BREAKDOWN")
    print("=" * 65)
    header = f"{'Class ID':<9} {'Class Name':<16} {'Precision':<11} {'Recall':<10} {'AP@50':<10} {'AP@50-95':<10}"
    print(header)
    print("-" * 65)

    # Class indices mapping
    ap_class_index = getattr(box_metrics, 'ap_class_index', list(range(16)))
    if hasattr(ap_class_index, 'tolist'):
        ap_class_index = ap_class_index.tolist()
    cls_to_idx = {int(cid): idx for idx, cid in enumerate(ap_class_index)}

    p_arr = getattr(box_metrics, 'p', None)
    r_arr = getattr(box_metrics, 'r', None)
    ap50_arr = getattr(box_metrics, 'ap50', None)
    ap_arr = getattr(box_metrics, 'ap', None)
    maps_arr = getattr(box_metrics, 'maps', None)

    for i in range(16):
        cname = CLASS_NAMES[i]
        row_idx = cls_to_idx.get(i, None)

        p_val = 0.0
        r_val = 0.0
        ap50_val = 0.0
        ap_val = 0.0

        if row_idx is not None:
            if p_arr is not None and row_idx < len(p_arr):
                p_val = float(p_arr[row_idx])
            if r_arr is not None and row_idx < len(r_arr):
                r_val = float(r_arr[row_idx])
            if ap50_arr is not None and row_idx < len(ap50_arr):
                ap50_val = float(ap50_arr[row_idx])
            
            if maps_arr is not None and i < len(maps_arr):
                ap_val = float(maps_arr[i])
            elif ap_arr is not None and row_idx < len(ap_arr):
                raw_ap = ap_arr[row_idx]
                if hasattr(raw_ap, 'mean'):
                    ap_val = float(raw_ap.mean())
                else:
                    ap_val = float(raw_ap)

        print(f"{i:<9} {cname:<16} {p_val:<11.4f} {r_val:<10.4f} {ap50_val:<10.4f} {ap_val:<10.4f}")
        per_class_results.append({
            "class_id": i,
            "class_name": cname,
            "precision": p_val,
            "recall": r_val,
            "ap50": ap50_val,
            "ap50_95": ap_val
        })

    # Save results to training/webpii_16class_yolo11n/evaluation/
    eval_dir = weights_path.parent.parent / "evaluation"
    eval_dir.mkdir(parents=True, exist_ok=True)
    
    summary_data = {
        "weights": str(weights_path),
        "data_yaml": str(data_yaml_path),
        "test_split": "images/test (4,481 images)",
        "overall": {
            "precision": overall_p,
            "recall": overall_r,
            "map50": overall_map50,
            "map50_95": overall_map50_95
        },
        "classes": per_class_results
    }

    json_path = eval_dir / "evaluation_summary.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(summary_data, f, indent=2)

    print("\n" + "=" * 65)
    print(f"[OK] Evaluation results saved to: {json_path.resolve()}")
    print("=" * 65)
    return True

def parse_args():
    project_root = get_project_root()
    default_weights = project_root / "training" / "webpii_16class_yolo11n" / "weights" / "best.pt"
    default_data_yaml = project_root / "datasets" / "webpii_yolo" / "data.yaml"

    parser = argparse.ArgumentParser(description="Evaluate trained YOLO11n model on WebPII test split.")
    parser.add_argument("--weights", type=str, default=str(default_weights), help="Path to best.pt weights file")
    parser.add_argument("--data", type=str, default=str(default_data_yaml), help="Path to data.yaml")
    parser.add_argument("--device", default="0", help="GPU device ID or 'cpu' (default: 0)")
    parser.add_argument("--batch", type=int, default=16, help="Evaluation batch size (default: 16)")

    return parser.parse_args()

if __name__ == "__main__":
    args = parse_args()
    success = evaluate_model(
        weights_path=Path(args.weights),
        data_yaml_path=Path(args.data),
        device=str(args.device),
        batch=args.batch
    )
    sys.exit(0 if success else 1)
