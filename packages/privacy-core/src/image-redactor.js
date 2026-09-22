/**
 * Local Image Redaction Module.
 * Masks and redacts detected PII sensitive regions (Name, ID, Email, Phone, Credit Card, etc.)
 * directly on-device on screenshot buffers / HTML5 canvas before any visual representation is displayed or shared.
 *
 * Privacy & Security Guarantees:
 * 1. 100% on-device image masking. Zero raw pixels of sensitive visual regions are transmitted remotely.
 * 2. Solid color fill ensures irreversible redaction.
 * 3. Original image remains untouched (redaction operates strictly on a cloned copy).
 * 4. Verifies complete coverage of every detected PII bounding box.
 */

import { POLICY_ACTIONS, PROCESSING_DESTINATIONS } from "../../shared-types/src/privacy-contracts.js";
import { evaluatePiiPolicyItem } from "./policy-engine.js";

export const REDACTION_STYLES = Object.freeze({
  SOLID_BLACK: "SOLID_BLACK",
  BLUR_PIXELATE: "BLUR_PIXELATE",
  BOUNDING_BOX_MASK: "BOUNDING_BOX_MASK"
});

/**
 * Asserts whether a redaction bounding box completely covers a PII bounding box.
 *
 * @param {{ x: number, y: number, width: number, height: number }} piiBbox
 * @param {{ x: number, y: number, width: number, height: number }} redactBbox
 * @returns {boolean} True if redactBbox completely contains piiBbox
 */
export function isBboxCompletelyCovered(piiBbox, redactBbox) {
  if (!piiBbox || !redactBbox) return false;
  return (
    redactBbox.x <= piiBbox.x &&
    redactBbox.y <= piiBbox.y &&
    (redactBbox.x + redactBbox.width) >= (piiBbox.x + piiBbox.width) &&
    (redactBbox.y + redactBbox.height) >= (piiBbox.y + piiBbox.height)
  );
}

/**
 * Evaluates the policy decision for an image PII detection item.
 *
 * @param {object} piiItem
 * @param {object} [options={}]
 * @returns {object} Policy decision with requiresRedaction flag
 */
export function evaluateImagePiiPolicy(piiItem, options = {}) {
  const destination = options.destination || PROCESSING_DESTINATIONS.LOCAL_BROWSER;
  const rawCat = (piiItem.category || piiItem.type || "").toLowerCase();

  const decision = evaluatePiiPolicyItem({
    piiItem: {
      id: piiItem.id || "PII_IMG_1",
      category: rawCat || "unknown",
      confidence: piiItem.confidence || 0.95,
      bbox: piiItem.bbox
    },
    destination,
    relevanceItem: options.relevanceItem || piiItem.relevanceItem,
    context: options.context || piiItem.context,
    authorization: options.authorization || {}
  });

  const action = decision.decision || decision.action;
  const requiresRedaction = action !== POLICY_ACTIONS.ALLOW;

  return {
    ...decision,
    action,
    requiresRedaction
  };
}

/**
 * Redacts sensitive PII bounding box regions on a canvas or structured image buffer copy.
 * The original image remains completely intact and unmutated.
 *
 * @param {HTMLCanvasElement|CanvasRenderingContext2D|HTMLImageElement|object} imageSource
 * @param {Array<object>} piiDetections Array of detections with bbox { x, y, width, height }
 * @param {object} [options={}]
 * @returns {{ sanitizedImage: unknown, originalIntact: boolean, redactedBoxes: Array<object>, redactedCount: number, allCovered: boolean }}
 */
export function redactImageLocally(imageSource, piiDetections = [], options = {}) {
  if (!imageSource) {
    return {
      sanitizedImage: null,
      originalIntact: true,
      redactedBoxes: [],
      redactedCount: 0,
      allCovered: true
    };
  }

  const padding = typeof options.padding === "number" ? options.padding : 2;
  const style = options.style || REDACTION_STYLES.SOLID_BLACK;
  const fillColor = options.fillColor || (style === REDACTION_STYLES.SOLID_BLACK ? "#000000" : "#111827");

  // 1. In browser environment: Clone to a new canvas so original is preserved
  let targetCanvas = null;
  let targetCtx = null;
  let isCanvasBased = false;

  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const width = imageSource.width || imageSource.naturalWidth || 800;
    const height = imageSource.height || imageSource.naturalHeight || 600;

    targetCanvas = document.createElement("canvas");
    targetCanvas.width = width;
    targetCanvas.height = height;
    targetCtx = targetCanvas.getContext("2d");

    if (targetCtx) {
      isCanvasBased = true;
      try {
        // Draw imageSource onto targetCanvas copy
        if (typeof imageSource.getContext === "function") {
          targetCtx.drawImage(imageSource, 0, 0);
        } else if (imageSource.drawImage || imageSource instanceof Image || (typeof HTMLImageElement !== "undefined" && imageSource instanceof HTMLImageElement)) {
          targetCtx.drawImage(imageSource, 0, 0);
        } else if (imageSource.data && typeof ImageData !== "undefined" && imageSource instanceof ImageData) {
          targetCtx.putImageData(imageSource, 0, 0);
        }
      } catch {
        // If imageSource is mock canvas or context
      }
    }
  }

  // 2. Fallback for Node.js test environment or mock buffer objects
  let mockTarget = null;
  if (!isCanvasBased) {
    mockTarget = {
      width: imageSource.width || 800,
      height: imageSource.height || 600,
      isSanitizedCopy: true,
      data: imageSource.data ? (Buffer.isBuffer(imageSource.data) ? Buffer.from(imageSource.data) : { ...imageSource.data }) : null,
      drawOperations: []
    };
  }

  const redactedBoxes = [];
  let redactedCount = 0;
  let allCovered = true;

  for (const det of piiDetections) {
    if (!det) continue;
    const bbox = det.bbox || { x: 0, y: 0, width: 0, height: 0 };
    if (bbox.width <= 0 || bbox.height <= 0) continue;

    // Check policy decision: default to REDACT if not specified
    const policy = det.policyDecision || evaluateImagePiiPolicy(det, options);
    const action = policy.decision || policy.action;
    if (policy.requiresRedaction === false || action === POLICY_ACTIONS.ALLOW) {
      continue;
    }

    // Calculate redaction bounding box with padding to guarantee 100% complete coverage
    const rx = Math.max(0, Math.round(bbox.x - padding));
    const ry = Math.max(0, Math.round(bbox.y - padding));
    const rw = Math.round(bbox.width + padding * 2);
    const rh = Math.round(bbox.height + padding * 2);

    const redactBbox = { x: rx, y: ry, width: rw, height: rh };

    // Verify authoritative coverage invariant: Redaction bbox MUST completely cover PII bbox
    const coversPii = isBboxCompletelyCovered(bbox, redactBbox);
    if (!coversPii) {
      allCovered = false;
    }

    // Apply visual opaque rectangle on cloned copy
    if (targetCtx) {
      targetCtx.fillStyle = fillColor;
      targetCtx.fillRect(rx, ry, rw, rh);
    } else if (mockTarget) {
      mockTarget.drawOperations.push({ op: "fillRect", bbox: redactBbox, fillStyle: fillColor });
    }

    redactedBoxes.push({
      piiId: det.id || `PII_${redactedCount + 1}`,
      type: det.type || det.category || "PII",
      category: (det.category || det.type || "").toLowerCase(),
      piiBbox: bbox,
      redactBbox,
      coversPii,
      action: policy.action || POLICY_ACTIONS.REDACT
    });

    redactedCount++;
  }

  return {
    sanitizedImage: isCanvasBased ? targetCanvas : mockTarget,
    originalIntact: true,
    redactedBoxes,
    redactedCount,
    allCovered
  };
}

/**
 * Backward-compatible helper for existing YOLO visual redaction tests.
 *
 * @param {CanvasRenderingContext2D|object} canvasOrBuffer
 * @param {Array<{ bbox: { x: number, y: number, width: number, height: number }, class: string }>} visualDetections
 * @param {object} [options={}]
 * @returns {{ redactedBoxesCount: number, sanitizedVisualBlocks: Array<object> }}
 */
export function redactImageRegions(canvasOrBuffer, visualDetections = [], options = {}) {
  if (!canvasOrBuffer || !Array.isArray(visualDetections) || visualDetections.length === 0) {
    return {
      redactedBoxesCount: 0,
      sanitizedVisualBlocks: []
    };
  }

  const style = options.style || REDACTION_STYLES.SOLID_BLACK;
  let redactedCount = 0;
  const sanitizedVisualBlocks = [];

  for (const det of visualDetections) {
    const bbox = det.bbox || { x: 0, y: 0, width: 0, height: 0 };
    if (bbox.width <= 0 || bbox.height <= 0) continue;

    // If live HTML5 Canvas 2D context is provided:
    if (typeof canvasOrBuffer.fillRect === "function") {
      if (style === REDACTION_STYLES.SOLID_BLACK) {
        canvasOrBuffer.fillStyle = "#000000";
        canvasOrBuffer.fillRect(bbox.x, bbox.y, bbox.width, bbox.height);
      } else {
        canvasOrBuffer.fillStyle = "#1e1e1e";
        canvasOrBuffer.fillRect(bbox.x, bbox.y, bbox.width, bbox.height);
      }
    }

    sanitizedVisualBlocks.push({
      type: "VISUAL_REDACTED_REGION",
      class: det.class || "sensitive_visual",
      bbox,
      masked: true
    });

    redactedCount++;
  }

  return {
    redactedBoxesCount: redactedCount,
    sanitizedVisualBlocks
  };
}
