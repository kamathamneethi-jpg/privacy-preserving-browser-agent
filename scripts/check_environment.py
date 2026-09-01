#!/usr/bin/env python3
"""
Environment Diagnostic Script
Reports Python, PyTorch, Torchvision, Ultralytics, CUDA, GPU, and OS/hardware information.
Supports both Mac development environments and NVIDIA RTX CUDA environments.
"""

import sys
import platform

def check_environment() -> bool:
    print("=" * 65)
    print("      ENVIRONMENT & HARDWARE DIAGNOSTICS")
    print("=" * 65)

    os_name = platform.system()
    os_release = platform.release()
    os_version = platform.version()
    cpu_arch = platform.machine()

    print(f"Operating System: {os_name} ({platform.platform()})")
    print(f"CPU Architecture: {cpu_arch}")
    print(f"Python Version:   {sys.version.split()[0]} ({sys.executable})")

    # 1. Check PyTorch
    torch_installed = False
    cuda_available = False
    try:
        import torch
        torch_installed = True
        print(f"\n[OK] PyTorch Version:   {torch.__version__}")
        
        # Check CUDA
        cuda_available = torch.cuda.is_available()
        print(f"CUDA Available:         {cuda_available}")
        
        if cuda_available:
            cuda_version = torch.version.cuda
            device_count = torch.cuda.device_count()
            print(f"CUDA Runtime Version:   {cuda_version}")
            print(f"NVIDIA GPU Count:       {device_count}")
            
            for i in range(device_count):
                gpu_name = torch.cuda.get_device_name(i)
                total_mem_bytes = torch.cuda.get_device_properties(i).total_memory
                total_mem_gb = total_mem_bytes / (1024 ** 3)
                print(f"  -> GPU {i}: {gpu_name} ({total_mem_gb:.2f} GB VRAM)")
        else:
            if os_name == "Darwin":
                print("  -> Info: Running on Apple Silicon/macOS. CUDA is not expected on macOS.")
            else:
                print("  -> WARNING: NVIDIA CUDA is not available on this machine.")
                print("     Make sure NVIDIA drivers and CUDA-enabled PyTorch are installed before training.")

    except ImportError:
        print("[FAIL] PyTorch is NOT installed. Run: pip install -r requirements.txt")

    # 2. Check Torchvision
    try:
        import torchvision
        print(f"[OK] Torchvision Version: {torchvision.__version__}")
    except ImportError:
        print("[FAIL] Torchvision is NOT installed. Run: pip install -r requirements.txt")

    # 3. Check Ultralytics
    try:
        import ultralytics
        print(f"[OK] Ultralytics Version: {ultralytics.__version__}")
    except ImportError:
        print("[FAIL] Ultralytics is NOT installed. Run: pip install -r requirements.txt")

    # 4. Check PyYAML
    try:
        import yaml
        print(f"[OK] PyYAML Version:      {yaml.__version__}")
    except ImportError:
        print("[FAIL] PyYAML is NOT installed. Run: pip install -r requirements.txt")

    print("\n" + "=" * 65)
    print("SUMMARY:")
    if not torch_installed:
        print("Status: INCOMPLETE (PyTorch missing)")
        return False
    elif cuda_available:
        print("Status: READY FOR NVIDIA GPU ACCELERATED TRAINING (CUDA detected)")
        return True
    elif os_name == "Darwin":
        print("Status: READY FOR MAC DEVELOPMENT / VALIDATION ONLY (No CUDA on macOS)")
        print("        Actual model training MUST be executed on the NVIDIA RTX laptop.")
        return True
    else:
        print("Status: CPU ONLY ENVIRONMENT (WARNING: CUDA not detected on non-Mac host)")
        print("        Install CUDA-enabled PyTorch before running train_yolo.py.")
        return False

if __name__ == "__main__":
    check_environment()
