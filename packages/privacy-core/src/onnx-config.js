/**
 * Centralized Configuration for ONNX Runtime Web / Local ML Inference (Step 12).
 * Defines runtime parameters, execution providers, tensor limits, and timeout thresholds.
 */

import {
  ONNX_EXECUTION_PROVIDERS,
  ONNX_MODEL_TYPES
} from "../../shared-types/src/privacy-contracts.js";

export const ONNX_RUNTIME_VERSION = "1.0.0";

export const ONNX_CONFIG = Object.freeze({
  ONNX_RUNTIME_VERSION: "1.0.0",
  DEFAULT_PROVIDER: ONNX_EXECUTION_PROVIDERS.WASM,
  SUPPORTED_PROVIDERS: Object.freeze([
    ONNX_EXECUTION_PROVIDERS.WASM,
    ONNX_EXECUTION_PROVIDERS.WEBGL,
    ONNX_EXECUTION_PROVIDERS.WEBGPU,
    ONNX_EXECUTION_PROVIDERS.CPU,
    ONNX_EXECUTION_PROVIDERS.MOCK_TEST
  ]),
  SUPPORTED_DATA_TYPES: Object.freeze([
    "float32",
    "int32",
    "int64",
    "uint8"
  ]),
  DEFAULT_MODEL_TYPE: ONNX_MODEL_TYPES.CUSTOM,
  MAX_TENSOR_ELEMENTS: 5000000,      // Max allowable tensor elements per inference
  MAX_MODEL_SIZE_BYTES: 104857600,  // Max allowable model size (100MB)
  INFERENCE_TIMEOUT_MS: 5000,       // Processing timeout (5 seconds)
  MAX_BATCH_SIZE: 16                // Maximum batch dimension size
});
