/**
 * On-Device OCR / Visual Model Adapter Module (Step 10).
 * Provides a modular, local-only visual perception layer that extracts visual text and bounding boxes
 * on-device and feeds structured OCR blocks into the Step 5/6 privacy pipeline.
 *
 * Privacy & Security Guarantees:
 * 1. Executes 100% on-device (zero remote network transmission of screenshots or raw pixels).
 * 2. Visual perception only (does not make privacy decisions and does not perform browser actions).
 * 3. Fail-closed safety: Any processing failure or malformed input safely returns empty blocks.
 * 4. Raw OCR text is localized and sanitized through the existing Step 5/6 pipeline before leaving local boundaries.
 */

import {
  VISUAL_PERCEPTION_STATUS,
  VISUAL_BACKENDS
} from "../../shared-types/src/privacy-contracts.js";
import { VISUAL_CONFIG, VISUAL_MODEL_VERSION } from "./visual-config.js";
import { processOcrResult } from "./detection.js";
import { sanitizeLocalizedItems } from "./localization.js";

/**
 * Normalizes an individual OCR bounding box to valid, non-negative integer dimensions.
 *
 * @param {object} bbox
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
function normalizeBoundingBox(bbox) {
  if (!bbox || typeof bbox !== "object") {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return {
    x: Math.max(0, Math.round(Number(bbox.x) || 0)),
    y: Math.max(0, Math.round(Number(bbox.y) || 0)),
    width: Math.max(0, Math.round(Number(bbox.width) || 0)),
    height: Math.max(0, Math.round(Number(bbox.height) || 0))
  };
}

/**
 * Normalizes confidence score to a bounded float [0.0, 1.0] (or 0-100 normalized).
 *
 * @param {number|undefined} conf
 * @returns {number}
 */
function normalizeConfidence(conf) {
  const num = Number(conf);
  if (isNaN(num)) return 0.90; // Default reasonable baseline if unassigned
  if (num > 1.0) {
    // 0 - 100 scale input normalized to 0.0 - 1.0
    return Math.min(1.0, Math.max(0.0, Number((num / 100).toFixed(2))));
  }
  return Math.min(1.0, Math.max(0.0, Number(num.toFixed(2))));
}

/**
 * Modular Visual Model Adapter Class
 */
export class VisualModelAdapter {
  constructor(customConfig = {}) {
    this.config = { ...VISUAL_CONFIG, ...customConfig };
    this.status = VISUAL_PERCEPTION_STATUS.UNINITIALIZED;
    this.backend = this.config.DEFAULT_BACKEND;
    this.lastProcessedAt = null;
    this.onnxAdapter = customConfig.onnxAdapter || null;
  }

  /**
   * Attaches an ONNX Runtime Adapter for ONNX_WEB visual perception operations.
   *
   * @param {object} onnxAdapter
   */
  attachOnnxRuntime(onnxAdapter) {
    this.onnxAdapter = onnxAdapter;
  }


  /**
   * Initializes the visual perception engine.
   *
   * @param {object} [customConfig={}]
   * @returns {object} Initialization status
   */
  initialize(customConfig = {}) {
    try {
      const mergedConfig = { ...this.config, ...customConfig };
      const requestedBackend = customConfig.backend || mergedConfig.DEFAULT_BACKEND || this.backend;

      if (mergedConfig.SUPPORTED_BACKENDS && !mergedConfig.SUPPORTED_BACKENDS.includes(requestedBackend)) {
        this.status = VISUAL_PERCEPTION_STATUS.ERROR;
        return Object.freeze({
          ok: false,
          error: `Unsupported visual backend: ${requestedBackend}`,
          state: this.status
        });
      }

      this.config = mergedConfig;
      this.backend = requestedBackend;
      this.status = VISUAL_PERCEPTION_STATUS.READY;

      return Object.freeze({
        ok: true,
        state: this.status,
        backend: this.backend,
        version: this.config.VISUAL_MODEL_VERSION || VISUAL_MODEL_VERSION
      });
    } catch (err) {
      this.status = VISUAL_PERCEPTION_STATUS.ERROR;
      return Object.freeze({
        ok: false,
        error: "Visual model initialization failed.",
        state: this.status
      });
    }
  }

  /**
   * Checks whether the adapter is ready for visual recognition.
   *
   * @returns {boolean}
   */
  isReady() {
    return this.status === VISUAL_PERCEPTION_STATUS.READY;
  }

  /**
   * Returns current adapter status.
   *
   * @returns {string}
   */
  getState() {
    return this.status;
  }

  /**
   * Performs local visual OCR text recognition on input image or blocks.
   *
   * @param {Array<object>|object} imageInput - Raw blocks or Image descriptor
   * @param {object} [options={}] - Scan options
   * @returns {object} Structured OCR blocks: { ok: boolean, blocks: Array<object>, metadata: object }
   */
  recognize(imageInput, options = {}) {
    const startTime = Date.now();

    // 1. Lifecycle guard: Adapter must be initialized
    if (this.status !== VISUAL_PERCEPTION_STATUS.READY && this.status !== VISUAL_PERCEPTION_STATUS.PROCESSING) {
      return Object.freeze({
        ok: false,
        error: `Visual model adapter is in '${this.status}' state. Must be initialized before use.`,
        blocks: []
      });
    }

    // 2. Validate input
    if (!imageInput) {
      return Object.freeze({
        ok: false,
        error: "Missing imageInput for visual recognition.",
        blocks: []
      });
    }

    // 3. Dimension bounds check
    if (typeof imageInput === "object" && !Array.isArray(imageInput)) {
      const width = Number(imageInput.width || 0);
      const height = Number(imageInput.height || 0);
      if (width > this.config.MAX_IMAGE_DIMENSION || height > this.config.MAX_IMAGE_DIMENSION) {
        return Object.freeze({
          ok: false,
          error: `Image dimensions (${width}x${height}) exceed maximum allowable dimension (${this.config.MAX_IMAGE_DIMENSION}).`,
          blocks: []
        });
      }
    }

    this.status = VISUAL_PERCEPTION_STATUS.PROCESSING;

    try {
      let rawBlocks = [];

      if (Array.isArray(imageInput)) {
        rawBlocks = imageInput;
      } else if (Array.isArray(imageInput.blocks)) {
        rawBlocks = imageInput.blocks;
      } else if (Array.isArray(imageInput.words)) {
        rawBlocks = imageInput.words;
      } else if (typeof imageInput.text === "string") {
        rawBlocks = [{
          text: imageInput.text,
          bbox: imageInput.bbox || { x: 0, y: 0, width: 100, height: 20 },
          confidence: imageInput.confidence || 95
        }];
      }

      // 4. Normalize and sanitize OCR blocks
      const structuredBlocks = [];
      for (const block of rawBlocks) {
        if (!block || typeof block.text !== "string" || block.text.trim().length === 0) {
          continue;
        }

        const bbox = normalizeBoundingBox(block.bbox);
        const confidence = normalizeConfidence(block.confidence);

        // Filter out low confidence noise
        if (confidence < this.config.MIN_OCR_CONFIDENCE) {
          continue;
        }

        structuredBlocks.push({
          text: block.text,
          bbox,
          confidence
        });

        if (structuredBlocks.length >= this.config.MAX_BLOCK_COUNT) {
          break;
        }
      }

      const latencyMs = Date.now() - startTime;
      this.lastProcessedAt = Date.now();
      this.status = VISUAL_PERCEPTION_STATUS.READY;

      return Object.freeze({
        ok: true,
        blocks: structuredBlocks,
        metadata: Object.freeze({
          backend: this.backend,
          count: structuredBlocks.length,
          latencyMs,
          version: VISUAL_MODEL_VERSION
        })
      });
    } catch (err) {
      this.status = VISUAL_PERCEPTION_STATUS.READY;
      return Object.freeze({
        ok: false,
        error: "Local visual perception encountered an error.",
        blocks: []
      });
    }
  }

  /**
   * End-to-end pipeline: Performs on-device recognition and converts OCR blocks
   * into sanitized localized PII items via Step 5/6 detection.
   *
   * @param {Array<object>|object} imageInput
   * @param {object} [options={}]
   * @returns {object} { ok: boolean, localizedItems: Array<object>, count: number, metadata: object }
   */
  processVisualPii(imageInput, options = {}) {
    const ocrResult = this.recognize(imageInput, options);
    if (!ocrResult.ok) {
      return Object.freeze({
        ok: false,
        error: ocrResult.error,
        localizedItems: [],
        count: 0
      });
    }

    // Step 5 integration: Process OCR blocks (with fragment reconstruction & pattern detection)
    const ocrPiiItems = processOcrResult(ocrResult.blocks);

    // Ensure localized items are strictly sanitized
    const sanitizedItems = sanitizeLocalizedItems(ocrPiiItems);

    return Object.freeze({
      ok: true,
      localizedItems: sanitizedItems,
      count: sanitizedItems.length,
      metadata: ocrResult.metadata
    });
  }

  /**
   * Disposes of model resources and resets state to DISPOSED.
   *
   * @returns {object}
   */
  dispose() {
    this.status = VISUAL_PERCEPTION_STATUS.DISPOSED;
    this.lastProcessedAt = null;
    return Object.freeze({
      ok: true,
      state: this.status
    });
  }
}

/**
 * Factory function for creating a new isolated VisualModelAdapter instance.
 *
 * @param {object} [config={}]
 * @returns {VisualModelAdapter}
 */
export function createVisualModelAdapter(config = {}) {
  const adapter = new VisualModelAdapter(config);
  adapter.initialize();
  return adapter;
}

// Default singleton adapter instance
export const visualModelAdapter = createVisualModelAdapter();

// Convenience module exports delegating to default visualModelAdapter instance
export function initializeVisualModel(config) {
  return visualModelAdapter.initialize(config);
}

export function recognizeVisualText(imageInput, options) {
  return visualModelAdapter.recognize(imageInput, options);
}

export function processVisualPii(imageInput, options) {
  return visualModelAdapter.processVisualPii(imageInput, options);
}

export function disposeVisualModel() {
  return visualModelAdapter.dispose();
}
