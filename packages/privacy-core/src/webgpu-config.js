/**
 * Centralized Configuration for WebGPU Acceleration / Hardware-Aware Local Inference (Step 13).
 * Defines hardware detection timeouts, fallback providers, execution modes, and workload bounds.
 */

import {
  GPU_BACKEND_CAPABILITIES,
  GPU_EXECUTION_MODE
} from "../../shared-types/src/privacy-contracts.js";

export const WEBGPU_VERSION = "1.0.0";

export const WEBGPU_CONFIG = Object.freeze({
  WEBGPU_VERSION: "1.0.0",
  DEFAULT_MODE: GPU_EXECUTION_MODE.AUTO,
  FALLBACK_PROVIDER: GPU_BACKEND_CAPABILITIES.WASM,
  INIT_TIMEOUT_MS: 3000,           // 3 second hardware detection/adapter timeout
  MAX_WORKLOAD_ELEMENTS: 10000000, // Maximum tensor elements permitted for GPU dispatch
  POWER_PREFERENCE: "default",      // Configurable power preference ("default", "high-performance", "low-power")
  FEATURE_REQUIREMENTS: Object.freeze([]), // Optional WebGPU features array
  SAFE_FALLBACK_ON_ERROR: true      // Fail-closed safe fallback to WASM on GPU failure
});
