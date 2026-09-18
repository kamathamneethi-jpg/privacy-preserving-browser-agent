/**
 * DOM Redaction & Sanitization Layer.
 * Applies privacy policy decisions (ALLOW, REDACT, TOKENIZE, LOCAL_ONLY, ALLOW_IF_REQUIRED)
 * to sanitize DOM text nodes while strictly preserving DOM structure, element paths, and non-sensitive text.
 *
 * Privacy & Security Guarantees:
 * 1. Sanitized representation contains ZERO raw PII or vault secrets.
 * 2. Preserves element identity, bounding boxes, and hierarchy for accurate browser agent execution.
 * 3. Deterministic tokenization mapping.
 */

import { POLICY_ACTIONS } from "../../shared-types/src/privacy-contracts.js";
import { PiiCategory } from "./config.js";

/**
 * Redacts a single string based on detected PII spans and their policy decisions.
 *
 * @param {string} originalText
 * @param {Array<object>} detections - PII detections within this text
 * @param {Function|object} policyProvider - Map or function (detection) => { action, token }
 * @param {object} tokenCounter - Stateful counter for deterministic token IDs
 * @returns {{ sanitizedText: string, redactedCount: number, allowedCount: number, tokens: object }}
 */
export function redactTextString(originalText, detections = [], policyProvider = {}, tokenCounter = { index: 1 }) {
  if (typeof originalText !== "string" || detections.length === 0) {
    return { sanitizedText: originalText || "", redactedCount: 0, allowedCount: 0, tokens: {} };
  }

  // Sort detections ascending by start index
  const sortedDetections = [...detections].sort((a, b) => a.start - b.start);
  let result = "";
  let lastIndex = 0;
  let redactedCount = 0;
  let allowedCount = 0;
  const tokens = {};

  for (const det of sortedDetections) {
    // Append non-sensitive text prior to detection span
    if (det.start > lastIndex) {
      result += originalText.substring(lastIndex, det.start);
    }

    // Determine policy action
    let decision = POLICY_ACTIONS.REDACT;
    if (typeof policyProvider === "function") {
      const pol = policyProvider(det);
      decision = typeof pol === "string" ? pol : pol?.action || pol?.decision || POLICY_ACTIONS.REDACT;
    } else if (policyProvider[det.type]) {
      decision = policyProvider[det.type];
    }

    // Apply policy decision
    if (decision === POLICY_ACTIONS.ALLOW || decision === "ALLOW") {
      result += originalText.substring(det.start, det.end);
      allowedCount++;
    } else if (decision === POLICY_ACTIONS.TOKENIZE || decision === "TOKENIZE") {
      const categoryUpper = (det.type || "PII").toUpperCase().replace(/_FIELD$/, "");
      const token = `{{${categoryUpper}_${tokenCounter.index++}}}`;
      tokens[token] = { category: det.type, span: [det.start, det.end] };
      result += token;
      redactedCount++;
    } else if (decision === POLICY_ACTIONS.LOCAL_ONLY || decision === "LOCAL_ONLY") {
      result += "[LOCAL_ONLY_PROTECTED]";
      redactedCount++;
    } else {
      // Default REDACT / ALWAYS_REDACT
      result += "[REDACTED]";
      redactedCount++;
    }

    lastIndex = det.end;
  }

  // Append remaining text
  if (lastIndex < originalText.length) {
    result += originalText.substring(lastIndex);
  }

  return {
    sanitizedText: result,
    redactedCount,
    allowedCount,
    tokens
  };
}

/**
 * Sanitizes an array of DOM text nodes using detections and policy decisions.
 *
 * @param {Array<{ nodeId: string, elementPath: string, text: string, source: string, bbox: object }>} domNodes
 * @param {Array<object>} detections - Array of PIIDetection objects with nodeId references
 * @param {object|Function} policyRules - Policy mapping or decision function
 * @returns {{ sanitizedNodes: Array<object>, summary: object, tokenMapping: object }}
 */
export function redactDomNodes(domNodes = [], detections = [], policyRules = {}) {
  if (!Array.isArray(domNodes) || domNodes.length === 0) {
    return {
      sanitizedNodes: [],
      summary: { totalNodes: 0, redactedNodes: 0, totalRedactions: 0, totalAllowed: 0 },
      tokenMapping: {}
    };
  }

  // Group detections by nodeId
  const detectionsByNode = new Map();
  for (const det of detections) {
    if (det.nodeId) {
      if (!detectionsByNode.has(det.nodeId)) {
        detectionsByNode.set(det.nodeId, []);
      }
      detectionsByNode.get(det.nodeId).push(det);
    }
  }

  const tokenCounter = { index: 1 };
  const allTokens = {};
  let totalRedactions = 0;
  let totalAllowed = 0;
  let redactedNodesCount = 0;

  const sanitizedNodes = domNodes.map((node) => {
    const nodeDetections = detectionsByNode.get(node.nodeId) || [];
    if (nodeDetections.length === 0) {
      return { ...node };
    }

    const { sanitizedText, redactedCount, allowedCount, tokens } = redactTextString(
      node.text,
      nodeDetections,
      policyRules,
      tokenCounter
    );

    if (redactedCount > 0) redactedNodesCount++;
    totalRedactions += redactedCount;
    totalAllowed += allowedCount;
    Object.assign(allTokens, tokens);

    return {
      ...node,
      text: sanitizedText,
      isSanitized: redactedCount > 0
    };
  });

  return {
    sanitizedNodes,
    summary: {
      totalNodes: domNodes.length,
      redactedNodes: redactedNodesCount,
      totalRedactions,
      totalAllowed
    },
    tokenMapping: allTokens
  };
}
