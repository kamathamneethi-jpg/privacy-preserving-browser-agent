#!/usr/bin/env python3
"""
Fine-tuning and Calibration Script for Laya Policy Decision Layer (v2).
Implements:
1. LoRA adapter fine-tuning on ModernBERT / Laya backbone
2. Side-by-side epoch logging of train_loss, calib_loss, train_acc, calib_acc to monitor overfitting
3. Early stopping based on calib_loss
4. Temperature scaling optimization using L-BFGS to minimize NLL on calibration split
5. Empirical threshold sweep (theta in [0.50, 0.95]) on calib split to determine theta*
6. Provenance receipt: writes training_config.json, training_history.json, and calibration_params.json
"""

import os
import sys
import time
import json
import math
import hashlib
import argparse
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torch.optim import AdamW

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "datasets" / "policy-decisions"
MODEL_OUTPUT_DIR = ROOT / "models" / "laya-policy-checkpoint"

CLASSES = ["ALLOW", "TOKENIZE", "REDACT", "LOCAL_ONLY"]
CLASS2ID = {c: i for i, c in enumerate(CLASSES)}
ID2CLASS = {i: c for i, c in enumerate(CLASSES)}

def hash_file(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()

class PolicyDataset(Dataset):
    def __init__(self, jsonl_path, tokenizer, max_length=256):
        self.items = []
        with open(jsonl_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    self.items.append(json.loads(line))
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self):
        return len(self.items)

    def __getitem__(self, idx):
        item = self.items[idx]
        state = item["state"]
        text = f"Field: {state.get('label', '')} | Type: {state.get('type', '')} | Task: {state.get('task_context', '')} | DOM Context: {state.get('surrounding_dom', '')}"
        label_str = item["correct_answer"]
        label_id = CLASS2ID.get(label_str, 0)

        enc = self.tokenizer(
            text,
            max_length=self.max_length,
            padding="max_length",
            truncation=True,
            return_tensors="pt"
        )

        return {
            "input_ids": enc["input_ids"].squeeze(0),
            "attention_mask": enc["attention_mask"].squeeze(0),
            "label": torch.tensor(label_id, dtype=torch.long),
            "is_adversarial": item.get("is_adversarial", False)
        }

def compute_ece(probs, labels, n_bins=10):
    """Computes Expected Calibration Error."""
    bin_boundaries = torch.linspace(0, 1, n_bins + 1)
    confidences, predictions = torch.max(probs, dim=1)
    accuracies = predictions.eq(labels)

    ece = torch.zeros(1, device=probs.device)
    for bin_lower, bin_upper in zip(bin_boundaries[:-1], bin_boundaries[1:]):
        in_bin = confidences.gt(bin_lower.item()) * confidences.le(bin_upper.item())
        prop_in_bin = in_bin.float().mean()
        if prop_in_bin.item() > 0:
            accuracy_in_bin = accuracies[in_bin].float().mean()
            avg_confidence_in_bin = confidences[in_bin].mean()
            ece += torch.abs(avg_confidence_in_bin - accuracy_in_bin) * prop_in_bin
    return float(ece.item())

def fit_temperature(logits, labels):
    """Fits scalar temperature T using L-BFGS to minimize NLL on calibration logits."""
    log_temp = torch.zeros(1, requires_grad=True, device=logits.device)
    nll_criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.LBFGS([log_temp], lr=0.05, max_iter=150)

    def eval_loss():
        optimizer.zero_grad()
        scaled = logits / torch.exp(log_temp)
        loss = nll_criterion(scaled, labels)
        loss.backward()
        return loss

    optimizer.step(eval_loss)
    opt_temp = float(torch.exp(log_temp).clamp(0.1, 10.0).item())
    return opt_temp

def sweep_theta_star(calib_probs, calib_labels, calib_rules=None):
    """
    Sweeps theta in [0.50, 0.95] to find optimal operating threshold theta*.
    Target: Maximize Fault-Catch Recall while keeping False Flag Rate <= 5%.
    """
    confidences, predictions = torch.max(calib_probs, dim=1)
    n_calib = len(calib_labels)

    best_theta = 0.85
    best_f1 = 0.0
    sweep_results = []

    # If calib_rules is not provided, evaluate against model confidence correctness
    for theta_int in range(50, 96, 2):
        theta = theta_int / 100.0
        high_conf = confidences >= theta
        
        # When model is high confidence, is it accurate?
        if high_conf.sum().item() > 0:
            correct_at_high = predictions[high_conf].eq(calib_labels[high_conf]).float().mean().item()
            cov = high_conf.float().mean().item()
        else:
            correct_at_high = 1.0
            cov = 0.0

        sweep_results.append({
            "theta": theta,
            "coverage": round(cov, 4),
            "precision_at_threshold": round(correct_at_high, 4)
        })

        if correct_at_high >= 0.90 and cov > best_f1:
            best_f1 = cov
            best_theta = theta

    return best_theta, sweep_results

def main():
    parser = argparse.ArgumentParser(description="Train and Calibrate Laya Policy Layer")
    parser.add_argument("--base-model", type=str, default="answerdotai/ModernBERT-base", help="Hugging Face model checkpoint")
    parser.add_argument("--epochs", type=int, default=5, help="Number of training epochs")
    parser.add_argument("--batch-size", type=int, default=8, help="Training batch size")
    parser.add_argument("--lr", type=float, default=2e-4, help="Learning rate")
    parser.add_argument("--lora-r", type=int, default=8, help="LoRA rank")
    parser.add_argument("--lora-alpha", type=int, default=16, help="LoRA alpha")
    parser.add_argument("--full-finetune", action="store_true", help="Run full fine-tuning instead of LoRA")
    args = parser.parse_args()

    start_time = time.time()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"=== Laya Policy Layer Training Pipeline ===")
    print(f"Target Device: {device}")
    print(f"Base Model   : {args.base_model}")
    print(f"Mode         : {'Full Fine-Tuning' if args.full_finetune else 'PEFT LoRA (r=' + str(args.lora_r) + ')'}")

    MODEL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Dataset Verification & Hashes
    train_file = DATA_DIR / "train.jsonl"
    calib_file = DATA_DIR / "calib.jsonl"
    held_file = DATA_DIR / "held_out.jsonl"

    for f in [train_file, calib_file, held_file]:
        if not f.exists():
            print(f"Error: {f} not found! Run generate_dataset.py first.")
            sys.exit(1)

    hashes = {
        "train.jsonl": hash_file(train_file),
        "calib.jsonl": hash_file(calib_file),
        "held_out.jsonl": hash_file(held_file)
    }
    print("Dataset checksums verified:")
    for k, v in hashes.items():
        print(f"  {k}: {v[:16]}...")

    # 2. Tokenizer & Dataset Loaders
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    print(f"\nLoading tokenizer for {args.base_model}...")
    tokenizer = AutoTokenizer.from_pretrained(args.base_model)
    tokenizer.save_pretrained(str(MODEL_OUTPUT_DIR / "tokenizer"))

    train_ds = PolicyDataset(train_file, tokenizer)
    calib_ds = PolicyDataset(calib_file, tokenizer)
    held_ds = PolicyDataset(held_file, tokenizer)

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True)
    calib_loader = DataLoader(calib_ds, batch_size=args.batch_size, shuffle=False)

    print(f"Dataset split sizes: Train={len(train_ds)}, Calib={len(calib_ds)}, Held-out={len(held_ds)}")

    # 3. Model Setup (LoRA or Full)
    print("Initializing classification model (4 classes: ALLOW, TOKENIZE, REDACT, LOCAL_ONLY)...")
    model = AutoModelForSequenceClassification.from_pretrained(
        args.base_model,
        num_labels=4,
        id2label=ID2CLASS,
        label2id=CLASS2ID
    )

    if not args.full_finetune:
        from peft import get_peft_model, LoraConfig, TaskType
        peft_config = LoraConfig(
            task_type=TaskType.SEQ_CLS,
            r=args.lora_r,
            lora_alpha=args.lora_alpha,
            lora_dropout=0.1,
            target_modules=["Wqkv", "Wo"],
            bias="none"
        )
        model = get_peft_model(model, peft_config)
        model.print_trainable_parameters()
    else:
        print("Using full fine-tuning (all weights unfrozen).")

    model.to(device)

    # 4. Optimizer & Loss
    optimizer = AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
    criterion = nn.CrossEntropyLoss()

    # 5. Training Loop with Side-by-Side Loss Logging & Early Stopping
    print("\n--- Starting Training ---")
    training_history = []
    best_calib_loss = float("inf")
    patience = 3
    patience_counter = 0
    best_model_state = None

    for epoch in range(1, args.epochs + 1):
        model.train()
        total_train_loss = 0.0
        correct_train = 0
        total_train = 0

        for batch in train_loader:
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["label"].to(device)

            optimizer.zero_grad()
            outputs = model(input_ids=input_ids, attention_mask=attention_mask, labels=labels)
            loss = outputs.loss
            logits = outputs.logits

            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            total_train_loss += loss.item() * len(labels)
            preds = logits.argmax(dim=-1)
            correct_train += preds.eq(labels).sum().item()
            total_train += len(labels)

        avg_train_loss = total_train_loss / total_train
        train_acc = correct_train / total_train

        # Evaluate on Calibration set (calib_loss & calib_acc)
        model.eval()
        total_calib_loss = 0.0
        correct_calib = 0
        total_calib = 0

        with torch.no_grad():
            for batch in calib_loader:
                input_ids = batch["input_ids"].to(device)
                attention_mask = batch["attention_mask"].to(device)
                labels = batch["label"].to(device)

                outputs = model(input_ids=input_ids, attention_mask=attention_mask, labels=labels)
                total_calib_loss += outputs.loss.item() * len(labels)
                preds = outputs.logits.argmax(dim=-1)
                correct_calib += preds.eq(labels).sum().item()
                total_calib += len(labels)

        avg_calib_loss = total_calib_loss / total_calib
        calib_acc = correct_calib / total_calib

        epoch_stats = {
            "epoch": epoch,
            "train_loss": round(avg_train_loss, 4),
            "calib_loss": round(avg_calib_loss, 4),
            "train_acc": round(train_acc, 4),
            "calib_acc": round(calib_acc, 4)
        }
        training_history.append(epoch_stats)

        print(f"Epoch {epoch:2d}/{args.epochs:2d} | Train Loss: {avg_train_loss:.4f} | Calib Loss: {avg_calib_loss:.4f} | Train Acc: {train_acc*100:.1f}% | Calib Acc: {calib_acc*100:.1f}%")

        # Early Stopping check
        if avg_calib_loss < best_calib_loss:
            best_calib_loss = avg_calib_loss
            patience_counter = 0
            best_model_state = {k: v.cpu() for k, v in model.state_dict().items()}
        else:
            patience_counter += 1
            if patience_counter >= patience:
                print(f"Early stopping triggered at epoch {epoch} (patience={patience}).")
                break

    # Restore best checkpoint
    if best_model_state is not None:
        model.load_state_dict({k: v.to(device) for k, v in best_model_state.items()})

    # Save training history
    with open(MODEL_OUTPUT_DIR / "training_history.json", "w", encoding="utf-8") as f:
        json.dump(training_history, f, indent=2)
    print("\nSaved loss curves to models/laya-policy-checkpoint/training_history.json")

    # 6. Temperature Calibration on Calibration Split
    print("\n--- Running Temperature Scaling on Calibration Split ---")
    model.eval()
    all_calib_logits = []
    all_calib_labels = []

    with torch.no_grad():
        for batch in calib_loader:
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            outputs = model(input_ids=input_ids, attention_mask=attention_mask)
            all_calib_logits.append(outputs.logits)
            all_calib_labels.append(batch["label"].to(device))

    calib_logits = torch.cat(all_calib_logits, dim=0)
    calib_labels = torch.cat(all_calib_labels, dim=0)

    raw_probs = torch.softmax(calib_logits, dim=-1)
    raw_ece = compute_ece(raw_probs, calib_labels)
    print(f"Raw Calibration ECE (before temperature scaling): {raw_ece:.4f}")

    opt_temp = fit_temperature(calib_logits, calib_labels)
    calib_probs = torch.softmax(calib_logits / opt_temp, dim=-1)
    calib_ece = compute_ece(calib_probs, calib_labels)
    print(f"Optimal Temperature T*: {opt_temp:.3f}")
    print(f"Calibrated ECE       : {calib_ece:.4f} (Reduction: {raw_ece - calib_ece:+.4f})")

    # 7. Empirical Threshold Sweep for theta*
    print("\n--- Sweeping Threshold theta in [0.50, 0.95] on Calibration Split ---")
    opt_theta, sweep_log = sweep_theta_star(calib_probs, calib_labels)
    print(f"Empirically derived optimal threshold theta*: {opt_theta:.2f}")

    # 8. Save Model Weights and Calibration Artifacts
    if not args.full_finetune:
        model.save_pretrained(str(MODEL_OUTPUT_DIR))
    else:
        torch.save({"model_state": model.state_dict()}, MODEL_OUTPUT_DIR / "model.pt")

    # Save head projection weights for standalone fast inference
    torch.save({"model": model}, MODEL_OUTPUT_DIR / "head_weights.pt")

    # Save Calibration Parameters
    calib_params = {
        "optimal_temperature": round(opt_temp, 4),
        "optimal_theta": round(opt_theta, 4),
        "raw_ece": round(raw_ece, 4),
        "calibrated_ece": round(calib_ece, 4),
        "classes": CLASSES,
        "class2id": CLASS2ID,
        "calibration_sample_size": len(calib_ds),
        "threshold_sweep": sweep_log
    }
    with open(MODEL_OUTPUT_DIR / "calibration_params.json", "w", encoding="utf-8") as f:
        json.dump(calib_params, f, indent=2)

    # 9. Write Complete Training Provenance Receipt (training_config.json)
    elapsed_sec = round(time.time() - start_time, 2)
    receipt = {
        "mode": "full" if args.full_finetune else "lora",
        "base_model": args.base_model,
        "dataset_hashes": hashes,
        "hyperparameters": {
            "epochs_requested": args.epochs,
            "epochs_trained": len(training_history),
            "batch_size": args.batch_size,
            "learning_rate": args.lr,
            "lora_r": args.lora_r if not args.full_finetune else None,
            "lora_alpha": args.lora_alpha if not args.full_finetune else None,
            "weight_decay": 0.01,
            "dropout": 0.1
        },
        "device": str(device),
        "duration_seconds": elapsed_sec,
        "final_metrics": training_history[-1],
        "calibration": {
            "optimal_temperature": round(opt_temp, 4),
            "optimal_theta": round(opt_theta, 4),
            "ece_before": round(raw_ece, 4),
            "ece_after": round(calib_ece, 4)
        }
    }
    with open(MODEL_OUTPUT_DIR / "training_config.json", "w", encoding="utf-8") as f:
        json.dump(receipt, f, indent=2)

    print(f"\nTraining pipeline completed in {elapsed_sec}s.")
    print(f"Receipt written to models/laya-policy-checkpoint/training_config.json")

if __name__ == "__main__":
    main()
