/**
 * Centralized Configuration for On-Device OCR / Visual Perception (Step 10).
 * Defines model parameters, confidence thresholds, image bounds, and timeouts.
 */

import { VISUAL_BACKENDS } from "../../shared-types/src/privacy-contracts.js";

export const VISUAL_MODEL_VERSION = "1.0.0";

export const VISUAL_CONFIG = Object.freeze({
  VISUAL_MODEL_VERSION: "1.0.0",
  DEFAULT_BACKEND: VISUAL_BACKENDS.LOCAL_ADAPTER,
  MIN_OCR_CONFIDENCE: 0.60,      // Minimum confidence threshold for OCR text detection
  MAX_IMAGE_DIMENSION: 4096,     // Maximum width/height for visual processing
  PROCESSING_TIMEOUT_MS: 10000,  // Processing timeout (10 seconds)
  MAX_BLOCK_COUNT: 500,          // Cap on recognized text blocks per scan
  SUPPORTED_LANGUAGES: Object.freeze(["eng"]),

  SUPPORTED_BACKENDS: Object.freeze([
    VISUAL_BACKENDS.LOCAL_ADAPTER,
    VISUAL_BACKENDS.WASM,
    VISUAL_BACKENDS.TESSERACT_JS,
    VISUAL_BACKENDS.ONNX_WEB
  ])
});
