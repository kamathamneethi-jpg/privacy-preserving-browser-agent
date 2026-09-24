import os
import json
import time
import math
import torch
from pathlib import Path
try:
    from .config import MODEL_DIR, DEFAULT_BASE_MODEL, DEVICE, POLICY_CLASSES
except ImportError:
    from config import MODEL_DIR, DEFAULT_BASE_MODEL, DEVICE, POLICY_CLASSES

class LayaConfidenceEngine:
    def __init__(self, model_dir=None, device=None):
        self.model_dir = Path(model_dir or MODEL_DIR)
        self.device = device or DEVICE
        self.is_loaded = False
        self.mode = "base" # "finetuned" or "base"
        self.temperature = 1.0
        self.theta_star = 0.85 # Default fallback until calibrated
        self.router = None
        self.finetuned_model = None
        self.tokenizer = None
        self.rl_cfg = None

    def load(self):
        start_t = time.time()
        print(f"[LayaEngine] Initializing on device: {self.device}...")

        # 1. Check for calibration params
        calib_file = self.model_dir / "calibration_params.json"
        if calib_file.exists():
            try:
                with open(calib_file, "r", encoding="utf-8") as f:
                    calib_data = json.load(f)
                    self.temperature = float(calib_data.get("optimal_temperature", 1.0))
                    self.theta_star = float(calib_data.get("optimal_theta", 0.85))
                print(f"[LayaEngine] Loaded calibration params: T={self.temperature:.3f}, theta*={self.theta_star:.3f}")
            except Exception as e:
                print(f"[LayaEngine] Warning: Could not parse calibration params: {e}")

        # 2. Check for fine-tuned checkpoint
        receipt_file = self.model_dir / "training_config.json"
        has_checkpoint = (self.model_dir / "head_weights.pt").exists() or (self.model_dir / "adapter_model.safetensors").exists()

        if has_checkpoint:
            try:
                print(f"[LayaEngine] Loading fine-tuned checkpoint from {self.model_dir}...")
                self._load_finetuned_checkpoint()
                self.mode = "finetuned"
                self.is_loaded = True
                print(f"[LayaEngine] Fine-tuned model loaded in {time.time() - start_t:.2f}s")
                return
            except Exception as e:
                print(f"[LayaEngine] Failed to load fine-tuned checkpoint ({e}), falling back to base Laya Router...")

        # 3. Fallback: Base Laya Router
        try:
            from laya import Router
            print(f"[LayaEngine] Loading base Router(preload=True) on {self.device}...")
            self.router = Router(preload=True, device=self.device)
            self.mode = "base"
            self.is_loaded = True
            print(f"[LayaEngine] Base Laya Router loaded in {time.time() - start_t:.2f}s")
        except Exception as e:
            print(f"[LayaEngine] Base Laya Router initialization failed: {e}")
            raise e

    def _load_finetuned_checkpoint(self):
        from transformers import AutoTokenizer, AutoModel
        from safetensors.torch import load_file
        
        # Load tokenizer and base ModernBERT
        tok_dir = self.model_dir / "tokenizer"
        if tok_dir.exists():
            self.tokenizer = AutoTokenizer.from_pretrained(str(tok_dir))
        else:
            self.tokenizer = AutoTokenizer.from_pretrained(DEFAULT_BASE_MODEL)

        head_weights_path = self.model_dir / "head_weights.pt"
        if head_weights_path.exists():
            checkpoint = torch.load(head_weights_path, map_location=self.device, weights_only=False)
            self.finetuned_model = checkpoint["model"]
            self.finetuned_model.to(self.device)
            self.finetuned_model.eval()

    def score_field(self, state, options=None):
        start_t = time.perf_counter()
        target_options = options or POLICY_CLASSES

        if not self.is_loaded:
            raise RuntimeError("LayaConfidenceEngine is not loaded. Call .load() first.")

        if self.mode == "finetuned" and self.finetuned_model is not None:
            res = self._score_finetuned(state, target_options)
        else:
            res = self._score_router(state, target_options)

        latency_ms = (time.perf_counter() - start_t) * 1000.0
        res["latency_ms"] = round(latency_ms, 2)
        res["theta_star"] = self.theta_star
        return res

    def _score_router(self, state, options):
        # Format typed question for base Laya Router
        criteria = {
            "ALLOW": "Public non-sensitive data, public product info, navigation, search query",
            "TOKENIZE": "Context-relevant sensitive user data needing opaque token replacement",
            "REDACT": "Irrelevant sensitive PII or incidental data requiring permanent mask",
            "LOCAL_ONLY": "Critical credentials, passwords, OTPs, CVVs, card numbers"
        }
        filtered_criteria = {k: criteria.get(k, k) for k in options}

        questions = {
            "policy_decision": {
                "type": "choice",
                "instructions": "Determine privacy policy decision for this field.",
                "criteria": filtered_criteria
            }
        }

        # Query Laya Router
        prediction = self.router.predict(state, questions)
        answer = prediction.get("answers", {}).get("policy_decision", {})

        raw_choice = answer.get("choice", options[0])
        raw_conf = float(answer.get("confidence", 0.5))

        # Build synthetic or extract per-option probabilities
        raw_probs = answer.get("probabilities", {})
        if not raw_probs:
            # Approximate logits from raw_conf and apply temperature scaling
            z = {}
            for opt in options:
                z[opt] = math.log(max(raw_conf, 1e-4)) if opt == raw_choice else math.log(max((1.0 - raw_conf) / max(len(options) - 1, 1), 1e-4))
        else:
            z = {opt: math.log(max(raw_probs.get(opt, 1e-4), 1e-4)) for opt in options}

        # Temperature calibration: p_i = exp(z_i / T) / sum_j exp(z_j / T)
        exp_scaled = {opt: math.exp(z[opt] / max(self.temperature, 0.1)) for opt in options}
        total_exp = sum(exp_scaled.values())
        calib_probs = {opt: round(exp_scaled[opt] / total_exp, 4) for opt in options}

        # Find calibrated max choice
        best_choice = max(calib_probs, key=calib_probs.get)
        calibrated_conf = calib_probs[best_choice]

        return {
            "choice": best_choice,
            "confidence": calibrated_conf,
            "per_option_probs": calib_probs,
            "temperature_applied": self.temperature,
            "mode": self.mode
        }

    def _score_finetuned(self, state, options):
        # Format text representation
        text = f"Label: {state.get('label', '')} | Type: {state.get('type', '')} | DOM: {state.get('surrounding_dom', '')} | Task: {state.get('task_context', '')}"
        inputs = self.tokenizer(text, return_tensors="pt", truncation=True, max_length=256).to(self.device)

        with torch.no_grad():
            outputs = self.finetuned_model(**inputs)
            logits = outputs.logits if hasattr(outputs, "logits") else outputs
            # Scale logits with temperature T*
            scaled_logits = logits / max(self.temperature, 0.1)
            raw_probs = torch.softmax(scaled_logits, dim=-1).squeeze(0).tolist()

        prob_map = {c: raw_probs[i] for i, c in enumerate(POLICY_CLASSES)}
        # Filter and normalize for requested options
        subset_sum = sum(prob_map.get(opt, 0.0) for opt in options) or 1.0
        calib_probs = {opt: round(prob_map.get(opt, 0.0) / subset_sum, 4) for opt in options}
        best_choice = max(calib_probs, key=calib_probs.get)
        calibrated_conf = calib_probs[best_choice]

        return {
            "choice": best_choice,
            "confidence": calibrated_conf,
            "per_option_probs": calib_probs,
            "temperature_applied": self.temperature,
            "mode": self.mode
        }

    def score_batch(self, items):
        start_t = time.perf_counter()
        results = []
        for it in items:
            state = it.get("state", {})
            opts = it.get("options", POLICY_CLASSES)
            results.append(self.score_field(state, opts))
        total_latency_ms = (time.perf_counter() - start_t) * 1000.0
        return {
            "results": results,
            "batch_size": len(items),
            "total_latency_ms": round(total_latency_ms, 2),
            "avg_latency_per_field_ms": round(total_latency_ms / max(len(items), 1), 2)
        }
