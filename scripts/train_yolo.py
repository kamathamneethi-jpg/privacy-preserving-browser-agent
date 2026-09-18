#!/usr/bin/env python3
"""
WebPII YOLO11n Fine-Tuning Script
Handles pre-flight checks, dry runs, and GPU-accelerated fine-tuning of pretrained YOLO11n.

IMPORTANT: Training will ONLY start when explicitly executed without --dry-run or --preflight.
"""

import sys
import os
import argparse
import platform
from pathlib import Path
import yaml

def get_project_root() -> Path:
    # Resolve project root relative to script location
    return Path(__file__).resolve().parent.parent

def run_dry_run(config: dict) -> bool:
    print("=" * 65)
    print("               YOLO11n TRAINING DRY RUN")
    print("=" * 65)
    print("Mode: Validation & Dry Run (NO training will take place)")
    print()

    # 1. Verify environment and imports
    try:
        import torch
        print(f"[OK] PyTorch version:      {torch.__version__}")
        if torch.cuda.is_available():
            print(f"[OK] CUDA available:       True ({torch.cuda.get_device_name(0)})")
        else:
            print("[INFO] CUDA unavailable on this machine. GPU training validation must be performed on the RTX laptop.")
    except ImportError:
        print("[FAIL] PyTorch is not installed. Run: pip install -r requirements.txt")
        return False

    try:
        import ultralytics
        from ultralytics import YOLO
        print(f"[OK] Ultralytics version:  {ultralytics.__version__}")
    except ImportError:
        print("[FAIL] Ultralytics is not installed. Run: pip install -r requirements.txt")
        return False

    # 2. Verify dataset & data.yaml
    data_yaml_path = Path(config["data"])
    if not data_yaml_path.is_file():
        print(f"[FAIL] ERROR: data.yaml not found at {data_yaml_path}")
        return False
    print(f"[OK] Dataset config:       {data_yaml_path}")

    try:
        with open(data_yaml_path, "r", encoding="utf-8") as f:
            y_data = yaml.safe_load(f)
        if "/content/drive" in str(y_data.get("path", "")):
            print(f"[FAIL] Legacy Colab path found in data.yaml: {y_data.get('path')}")
            return False
        nc = y_data.get("nc", 0)
        if nc != 16:
            print(f"[FAIL] Expected 16 classes in data.yaml, found {nc}")
            return False
        print(f"[OK] Class taxonomy:       16 classes verified")
    except Exception as e:
        print(f"[FAIL] Error validating data.yaml: {e}")
        return False

    # 3. Verify base model specification
    print(f"[OK] Base Model weights:   {config['model']} (Pretrained fine-tuning)")

    # 4. Print exact planned training parameters
    print("\nPlanned Training Configuration:")
    print(f"  - Model:         {config['model']}")
    print(f"  - Dataset YAML:  {config['data']}")
    print(f"  - Epochs:        {config['epochs']}")
    print(f"  - Image Size:    {config['imgsz']}")
    print(f"  - Batch Size:    {config['batch']}")
    print(f"  - Device:        {config['device']}")
    print(f"  - Workers:       {config['workers']}")
    print(f"  - Pretrained:    {config['pretrained']}")
    print(f"  - Cache:         {config['cache']}")
    print(f"  - Patience:      {config['patience']}")
    print(f"  - Project:       {config['project']}")
    print(f"  - Name:          {config['name']}")

    print("\n" + "=" * 65)
    print("DRY RUN COMPLETE")
    print("TRAINING WAS NOT STARTED")
    print("=" * 65)
    return True

def run_preflight(config: dict) -> bool:
    print("=" * 65)
    print("          RTX LAPTOP GPU PRE-FLIGHT VERIFICATION")
    print("=" * 65)
    print("Checking training prerequisites before allowing execution...\n")
    
    passed = True

    # 1. Python check
    print(f"1. Python Version: {sys.version.split()[0]} ({sys.executable})")

    # 2. PyTorch check
    try:
        import torch
        print(f"2. PyTorch:        {torch.__version__}")
    except ImportError:
        print("2. [FAIL] PyTorch is NOT installed!")
        passed = False

    # 3. CUDA check
    if passed:
        if not torch.cuda.is_available():
            print("3. [FAIL] CUDA/NVIDIA GPU was NOT detected by PyTorch!")
            print("   Make sure NVIDIA drivers and CUDA-enabled PyTorch are installed.")
            passed = False
        else:
            cuda_version = torch.version.cuda
            device_count = torch.cuda.device_count()
            print(f"3. CUDA Version:   {cuda_version} (Device count: {device_count})")
            
            # 4. GPU properties
            dev_idx = 0
            if str(config["device"]).isdigit():
                dev_idx = int(config["device"])
            
            if dev_idx >= device_count:
                print(f"4. [FAIL] Requested GPU device index '{dev_idx}' exceeds available GPU count ({device_count})!")
                passed = False
            else:
                gpu_name = torch.cuda.get_device_name(dev_idx)
                total_mem_gb = torch.cuda.get_device_properties(dev_idx).total_memory / (1024 ** 3)
                print(f"4. GPU Device:     GPU {dev_idx}: {gpu_name} ({total_mem_gb:.2f} GB VRAM)")

    # 5. Ultralytics check
    try:
        import ultralytics
        from ultralytics import YOLO
        print(f"5. Ultralytics:    {ultralytics.__version__}")
    except ImportError:
        print("5. [FAIL] Ultralytics is NOT installed! Run: pip install -r requirements.txt")
        passed = False

    # 6. Dataset & data.yaml check
    data_yaml = Path(config["data"])
    if not data_yaml.is_file():
        print(f"6. [FAIL] Dataset data.yaml not found at {data_yaml}")
        passed = False
    else:
        try:
            with open(data_yaml, "r", encoding="utf-8") as f:
                y_data = yaml.safe_load(f)
            if "/content/drive" in str(y_data.get("path", "")):
                print(f"6. [FAIL] Legacy Colab path in data.yaml: {y_data.get('path')}")
                passed = False
            else:
                print(f"6. Dataset Config: {data_yaml} (16 classes verified)")
        except Exception as e:
            print(f"6. [FAIL] Could not parse data.yaml: {e}")
            passed = False

    # 7. Model weights check
    model_name = config["model"]
    print(f"7. Base Weights:   {model_name} (Will be downloaded automatically by Ultralytics if not local)")

    # 8. Output directory check
    output_dir = Path(config["project"]) / config["name"]
    if output_dir.exists():
        print(f"8. [WARNING] Output directory already exists: {output_dir}")
        print("   Ultralytics will append a run counter (e.g., _1, _2) or write to existing experiment.")
    else:
        print(f"8. Output Dir:     {output_dir} (Ready)")

    print("\nPlanned Training Configuration:")
    print(f"  - Model:         {config['model']}")
    print(f"  - Dataset:       {config['data']}")
    print(f"  - Epochs:        {config['epochs']}")
    print(f"  - Batch Size:    {config['batch']}")
    print(f"  - Image Size:    {config['imgsz']}")
    print(f"  - Device:        {config['device']}")
    print(f"  - Workers:       {config['workers']}")
    print(f"  - Cache:         {config['cache']}")

    print("\n" + "=" * 65)
    if passed:
        print("PRE-FLIGHT PASSED")
        print("TRAINING WAS NOT STARTED")
        print("=" * 65)
        print("Ready to train! Execute: python scripts/train_yolo.py --batch", config["batch"])
        return True
    else:
        print("PRE-FLIGHT FAILED")
        print("TRAINING WAS NOT STARTED")
        print("=" * 65)
        return False

def train(config: dict):
    print("=" * 65)
    print("          WEBPII YOLO11n FINE-TUNING EXECUTION")
    print("=" * 65)

    # 1. Strict GPU Safety check
    try:
        import torch
    except ImportError:
        print("ERROR: PyTorch is not installed. Please run: pip install -r requirements.txt")
        sys.exit(1)

    if not torch.cuda.is_available():
        print("=" * 65)
        print("CUDA/NVIDIA GPU was not detected.")
        print("Training was NOT started.")
        print("Install the correct NVIDIA/PyTorch environment and try again.")
        print("=" * 65)
        sys.exit(1)

    device_str = str(config["device"])
    if device_str.isdigit():
        dev_idx = int(device_str)
        if dev_idx >= torch.cuda.device_count():
            print(f"ERROR: Device GPU {dev_idx} requested, but only {torch.cuda.device_count()} GPUs found.")
            sys.exit(1)
        
        gpu_name = torch.cuda.get_device_name(dev_idx)
        total_mem_gb = torch.cuda.get_device_properties(dev_idx).total_memory / (1024 ** 3)
        print(f"GPU:          {dev_idx}")
        print(f"GPU name:     {gpu_name}")
        print(f"GPU memory:   {total_mem_gb:.2f} GB VRAM")
    else:
        print(f"GPU Device:   {device_str}")

    # 2. Check dataset YAML path
    data_yaml_path = Path(config["data"]).resolve()
    if not data_yaml_path.is_file():
        print(f"ERROR: WebPII dataset not found at {data_yaml_path}")
        sys.exit(1)

    # 3. Check for existing runs to avoid silent overwrites
    output_dir = Path(config["project"]) / config["name"]
    if output_dir.exists():
        existing_weights = output_dir / "weights" / "best.pt"
        if existing_weights.exists():
            print(f"\n[NOTICE] An existing trained model was found at: {existing_weights}")
            print(f"Ultralytics will create a new incremented directory to protect previous results.")

    # 4. Load model
    try:
        from ultralytics import YOLO
    except ImportError:
        print("ERROR: Ultralytics is not installed. Please run: pip install -r requirements.txt")
        sys.exit(1)

    print(f"\nInitializing YOLO model from pretrained: {config['model']} ...")
    try:
        model = YOLO(config["model"])
    except Exception as e:
        print(f"ERROR loading model '{config['model']}': {e}")
        print("Ultralytics needs to download pretrained weights if not cached locally.")
        sys.exit(1)

    print("\nStarting fine-tuning with parameters:")
    print(f"  - data:       {data_yaml_path}")
    print(f"  - epochs:     {config['epochs']}")
    print(f"  - imgsz:      {config['imgsz']}")
    print(f"  - batch:      {config['batch']}")
    print(f"  - device:     {config['device']}")
    print(f"  - workers:    {config['workers']}")
    print(f"  - pretrained: {config['pretrained']}")
    print(f"  - cache:      {config['cache']}")
    print(f"  - patience:   {config['patience']}")
    print(f"  - project:    {config['project']}")
    print(f"  - name:       {config['name']}")
    print("=" * 65 + "\n")

    try:
        results = model.train(
            data=str(data_yaml_path),
            epochs=config["epochs"],
            imgsz=config["imgsz"],
            batch=config["batch"],
            device=config["device"],
            workers=config["workers"],
            pretrained=config["pretrained"],
            cache=config["cache"],
            patience=config["patience"],
            project=config["project"],
            name=config["name"],
        )
        print("\n" + "=" * 65)
        print("TRAINING COMPLETED SUCCESSFULLY")
        print(f"Weights saved under: {output_dir}/weights/")
        print("To evaluate the model on the test set, run:")
        print("python scripts/evaluate_yolo.py")
        print("=" * 65)
        return results
    except torch.cuda.OutOfMemoryError as oom:
        print("\n" + "=" * 65)
        print("CUDA OUT OF MEMORY ERROR:")
        print(f"{oom}")
        print("\nGPU VRAM was insufficient for batch size", config["batch"])
        print("Please retry training with a smaller batch size:")
        if config["batch"] > 8:
            print(f"  python scripts/train_yolo.py --batch 8")
        elif config["batch"] > 4:
            print(f"  python scripts/train_yolo.py --batch 4")
        else:
            print(f"  python scripts/train_yolo.py --batch 2")
        print("=" * 65)
        sys.exit(1)
    except Exception as ex:
        print("\n" + "=" * 65)
        print(f"TRAINING ENCOUNTERED AN ERROR: {ex}")
        print("=" * 65)
        sys.exit(1)

def parse_args():
    project_root = get_project_root()
    default_data_yaml = str(project_root / "datasets" / "webpii_yolo" / "data.yaml")

    parser = argparse.ArgumentParser(
        description="Fine-tune YOLO11n on WebPII dataset with 16 PII classes."
    )
    parser.add_argument("--model", type=str, default="yolo11n.pt", help="Base model weights (default: yolo11n.pt)")
    parser.add_argument("--data", type=str, default=default_data_yaml, help="Path to data.yaml")
    parser.add_argument("--epochs", type=int, default=50, help="Number of training epochs (default: 50)")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size (default: 640)")
    parser.add_argument("--batch", type=int, default=16, help="Batch size (default: 16)")
    parser.add_argument("--device", default=0, help="GPU device ID or list (default: 0)")
    parser.add_argument("--workers", type=int, default=4, help="DataLoader worker threads (default: 4)")
    parser.add_argument("--pretrained", action="store_true", default=True, help="Start from pretrained weights")
    parser.add_argument("--cache", action="store_true", default=False, help="Cache dataset in memory/disk (default: False)")
    parser.add_argument("--patience", type=int, default=10, help="Early stopping patience (default: 10)")
    parser.add_argument("--project", type=str, default=str(project_root / "training"), help="Project save directory")
    parser.add_argument("--name", type=str, default="webpii_16class_yolo11n", help="Experiment name")
    parser.add_argument("--dry-run", action="store_true", help="Perform validation without training")
    parser.add_argument("--preflight", action="store_true", help="Perform RTX GPU pre-flight check without training")

    return parser.parse_args()

if __name__ == "__main__":
    args = parse_args()
    config = vars(args)

    if args.dry_run:
        success = run_dry_run(config)
        sys.exit(0 if success else 1)
    elif args.preflight:
        success = run_preflight(config)
        sys.exit(0 if success else 1)
    else:
        train(config)
