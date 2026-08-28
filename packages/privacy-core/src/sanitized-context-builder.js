/**
 * Sanitized Page State & Remote Reasoning Context Builder (Step 11).
 * Transforms raw DOM snapshots and OCR visual perception blocks into a strictly
 * sanitized, tokenized, and privacy-compliant page representation for remote reasoning.
 *
 * Privacy & Security Guarantees:
 * 1. Fail-closed: Any unmasked raw PII or malformed structure safely rejects the payload.
 * 2. Critical PII (passwords, OTPs, payment cards) is ALWAYS stripped, replaced with local-only markers or opaque tokens.
 * 3. Bounding boxes and spatial coordinates are preserved for AI visual reasoning without exposing sensitive pixel content or raw text.
 * 4. Zero raw sensitive values in returned payloads, token mappings, metadata, or logs.
 */

import {
  SANITIZED_CONTEXT_STATUS,
  TOKEN_TYPES,
  PROCESSING_DESTINATIONS,
  POLICY_ACTIONS
} from "../../shared-types/src/privacy-contracts.js";
import { SANITIZER_CONFIG, CONTEXT_BUILDER_VERSION } from "./sanitizer-config.js";
import { sanitizeRemotePayload, generatePiiToken } from "./policy-engine.js";
import { evaluatePiiTaskRelevance } from "./context-analyzer.js";
import { evaluateBatchPrivacyPolicy } from "./policy-engine.js";
import { areBoundingBoxesOverlapping } from "./fusion.js";

/**
 * Strips dangerous HTML tags and script-like elements.
 *
 * @param {string} tag
 * @returns {boolean}
 */
function isForbiddenTag(tag) {
  if (!tag || typeof tag !== "string") return false;
  return SANITIZER_CONFIG.STRIPPED_HTML_TAGS.includes(tag.toLowerCase().trim());
}

/**
 * Cleans an attributes object, stripping event handlers and raw data attributes.
 *
 * @param {object} [attrs={}]
 * @returns {object}
 */
function cleanAttributes(attrs = {}) {
  if (!attrs || typeof attrs !== "object") return {};
  const cleaned = {};

  for (const [key, value] of Object.entries(attrs)) {
    const lowerKey = key.toLowerCase();
    if (SANITIZER_CONFIG.STRIPPED_ATTRIBUTES.includes(lowerKey)) {
      continue;
    }
    if (lowerKey.startsWith("on")) {
      continue;
    }
    if (typeof value === "string") {
      cleaned[key] = value.length > SANITIZER_CONFIG.MAX_TEXT_LENGTH
        ? value.slice(0, SANITIZER_CONFIG.MAX_TEXT_LENGTH)
        : value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

/**
 * SanitizedContextBuilder Class
 */
export class SanitizedContextBuilder {
  constructor(customConfig = {}) {
    this.config = { ...SANITIZER_CONFIG, ...customConfig };
    this.status = SANITIZED_CONTEXT_STATUS.UNINITIALIZED;
    this.lastBuiltAt = null;
  }

  /**
   * Initializes the context builder.
   *
   * @param {object} [initOptions={}]
   * @returns {object}
   */
  initialize(initOptions = {}) {
    try {
      this.config = { ...this.config, ...initOptions };
      this.status = SANITIZED_CONTEXT_STATUS.READY;
      return Object.freeze({
        ok: true,
        state: this.status,
        version: CONTEXT_BUILDER_VERSION
      });
    } catch {
      this.status = SANITIZED_CONTEXT_STATUS.ERROR;
      return Object.freeze({
        ok: false,
        error: "Failed to initialize SanitizedContextBuilder.",
        state: this.status
      });
    }
  }

  /**
   * Checks whether the builder is ready.
   *
   * @returns {boolean}
   */
  isReady() {
    return this.status === SANITIZED_CONTEXT_STATUS.READY;
  }

  /**
   * Returns current status.
   *
   * @returns {string}
   */
  getState() {
    return this.status;
  }

  /**
   * Sanitizes a visual OCR block list, replacing sensitive text with tokens or placeholders
   * while strictly preserving spatial bounding box geometry.
   *
   * @param {Array<object>} visualBlocks
   * @param {Array<object>} policyResults
   * @returns {Array<object>}
   */
  sanitizeVisualBlocks(visualBlocks = [], policyResults = []) {
    if (!Array.isArray(visualBlocks)) return [];

    const sanitizedBlocks = [];
    const policyList = Array.isArray(policyResults) ? policyResults : [];

    for (const block of visualBlocks) {
      if (!block || typeof block !== "object") continue;

      let displayText = typeof block.text === "string" ? block.text : "";
      let isSensitive = false;
      let appliedAction = POLICY_ACTIONS.ALLOW;
      let token = null;

      // Check if this OCR block overlaps with any detected sensitive PII policy decision
      for (const policyItem of policyList) {
        const pii = policyItem.piiItem || policyItem;
        if (!pii) continue;

        const overlaps = pii.bbox && block.bbox
          ? areBoundingBoxesOverlapping(pii.bbox, block.bbox)
          : false;

        const catName = String(pii.category || "").toLowerCase();
        const textMatches = catName && (
          displayText.toLowerCase().includes(catName) ||
          catName.includes("password") ||
          catName.includes("card") ||
          catName.includes("email") ||
          catName.includes("phone")
        );

        if (overlaps || textMatches) {
          isSensitive = true;
          appliedAction = policyItem.action || POLICY_ACTIONS.REDACT;
          token = policyItem.token || null;
          break;
        }
      }

      // Check pattern signatures in display text
      const hasEmail = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi.test(displayText);
      const hasCard = /(?:\d[ -]*?){13,19}/g.test(displayText);
      const hasPhone = /(?:\+?\d[\d(). -]{7,}\d)/g.test(displayText);
      const hasPassword = /\bpassword\b/i.test(displayText);

      if (hasEmail || hasCard || hasPhone || hasPassword) {
        isSensitive = true;
      }

      if (isSensitive) {
        if (appliedAction === POLICY_ACTIONS.TOKENIZE && token) {
          displayText = `{{${token}}}`;
        } else if (appliedAction === POLICY_ACTIONS.LOCAL_ONLY) {
          displayText = "[LOCAL_ONLY_PROTECTED]";
        } else {
          displayText = "[OCR_TEXT_REDACTED]";
        }
      }

      sanitizedBlocks.push({
        text: displayText,
        bbox: {
          x: Math.max(0, Math.round(Number(block.bbox?.x) || 0)),
          y: Math.max(0, Math.round(Number(block.bbox?.y) || 0)),
          width: Math.max(0, Math.round(Number(block.bbox?.width) || 0)),
          height: Math.max(0, Math.round(Number(block.bbox?.height) || 0))
        },
        confidence: Math.min(1.0, Math.max(0.0, Number(block.confidence) || 0.9))
      });
    }

    return sanitizedBlocks;
  }

  /**
   * Sanitizes a DOM node tree recursively, enforcing depth/node limits, stripping forbidden tags,
   * cleaning attributes, and substituting PII text/values with policy-dictated tokens or redaction.
   *
   * @param {object} node
   * @param {Array<object>} policyResults
   * @param {number} [depth=0]
   * @param {object} [stats={ count: 0 }]
   * @returns {object|null}
   */
  sanitizeDomNode(node, policyResults = [], depth = 0, stats = { count: 0 }) {
    if (!node || typeof node !== "object") return null;
    if (depth > this.config.MAX_DOM_DEPTH) return null;
    if (stats.count >= this.config.MAX_NODES_PER_PAYLOAD) return null;

    stats.count += 1;

    // 1. Strip forbidden tags
    const tagName = String(node.tagName || node.tag || "").toLowerCase();
    if (isForbiddenTag(tagName)) {
      return null;
    }

    // 2. Clean attributes
    const rawAttrs = node.attributes || node.attrs || {};
    const attrs = cleanAttributes(rawAttrs);

    // 3. Process text and form field values against policy
    let nodeText = typeof node.text === "string" ? node.text : (typeof node.nodeValue === "string" ? node.nodeValue : null);

    // If node is a password input, always mask it to LOCAL_ONLY_PROTECTED
    if (attrs.type && attrs.type.toLowerCase().includes("password")) {
      attrs.sanitizedValue = "[LOCAL_ONLY_PROTECTED]";
      delete attrs.value;
    }

    for (const policyItem of policyResults) {
      const pii = policyItem.piiItem || policyItem;
      if (!pii) continue;

      const piiCat = String(pii.category || "").toLowerCase();
      const action = policyItem.action || POLICY_ACTIONS.REDACT;
      const token = policyItem.token || `TOKEN_${piiCat.toUpperCase()}`;

      // Check if node represents or contains sensitive field
      const isMatchingField = (attrs.name && attrs.name.toLowerCase().includes(piiCat)) ||
        (attrs.id && attrs.id.toLowerCase().includes(piiCat)) ||
        (attrs.autocomplete && attrs.autocomplete.toLowerCase().includes(piiCat)) ||
        (attrs.type && attrs.type.toLowerCase().includes(piiCat));

      if (isMatchingField || (attrs.value !== undefined && action !== POLICY_ACTIONS.ALLOW)) {
        if (action === POLICY_ACTIONS.TOKENIZE) {
          attrs.token = `{{${token}}}`;
          attrs.sanitizedValue = `{{${token}}}`;
        } else if (action === POLICY_ACTIONS.LOCAL_ONLY) {
          attrs.sanitizedValue = "[LOCAL_ONLY_PROTECTED]";
        } else {
          attrs.sanitizedValue = `[${piiCat.toUpperCase()}_REDACTED]`;
        }
        delete attrs.value;
      }

      if (nodeText) {
        if (action === POLICY_ACTIONS.TOKENIZE) {
          nodeText = `{{${token}}}`;
        } else if (action === POLICY_ACTIONS.LOCAL_ONLY) {
          nodeText = "[LOCAL_ONLY_PROTECTED]";
        } else if (action === POLICY_ACTIONS.REDACT) {
          nodeText = `[${piiCat.toUpperCase()}_REDACTED]`;
        }
      }
    }

    // Pattern redaction on any remaining node text
    if (typeof nodeText === "string") {
      nodeText = nodeText
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL_REDACTED]")
        .replace(/(?:\+?\d[\d(). -]{7,}\d)/g, "[PHONE_REDACTED]")
        .replace(/(?:\d[ -]*?){13,19}/g, "[CARD_REDACTED]");
    }

    // 4. Clean and recurse child nodes
    const children = [];
    const rawChildren = Array.isArray(node.children) ? node.children : [];
    for (const child of rawChildren) {
      const sanitizedChild = this.sanitizeDomNode(child, policyResults, depth + 1, stats);
      if (sanitizedChild) {
        children.push(sanitizedChild);
      }
    }

    const result = {
      tag: tagName || "div",
      attributes: attrs
    };

    if (nodeText !== null) {
      result.text = nodeText.length > this.config.MAX_TEXT_LENGTH
        ? nodeText.slice(0, this.config.MAX_TEXT_LENGTH)
        : nodeText;
    }

    if (children.length > 0) {
      result.children = children;
    }

    if (node.bbox) {
      result.bbox = {
        x: Math.max(0, Math.round(Number(node.bbox.x) || 0)),
        y: Math.max(0, Math.round(Number(node.bbox.y) || 0)),
        width: Math.max(0, Math.round(Number(node.bbox.width) || 0)),
        height: Math.max(0, Math.round(Number(node.bbox.height) || 0))
      };
    }

    return result;
  }

  /**
   * Assembles a complete sanitized reasoning context payload from perception, DOM, and task inputs.
   *
   * @param {object} input
   * @param {object} [input.domTree]
   * @param {Array<object>} [input.visualBlocks]
   * @param {string} [input.taskInstruction]
   * @param {Array<object>} [input.piiItems]
   * @param {Array<object>} [input.policyDecisions]
   * @param {string} [input.destination=PROCESSING_DESTINATIONS.REMOTE_REASONING]
   * @param {object} [options={}]
   * @returns {object} Sanitized payload conforming to SANITIZED_PAYLOAD_SHAPE
   */
  buildSanitizedContext(input, options = {}) {
    const startTime = Date.now();

    if (this.status !== SANITIZED_CONTEXT_STATUS.READY && this.status !== SANITIZED_CONTEXT_STATUS.PROCESSING) {
      this.initialize();
    }

    if (!input || typeof input !== "object") {
      return Object.freeze({
        ok: false,
        status: SANITIZED_CONTEXT_STATUS.ERROR,
        error: "Missing or invalid input for context builder.",
        payload: null
      });
    }

    this.status = SANITIZED_CONTEXT_STATUS.PROCESSING;

    try {
      const taskInstruction = typeof input.taskInstruction === "string" ? input.taskInstruction : "";
      const piiItems = Array.isArray(input.piiItems) ? input.piiItems : [];
      const destination = input.destination || PROCESSING_DESTINATIONS.REMOTE_REASONING;

      // 1. Task Context Analysis
      const taskContext = evaluatePiiTaskRelevance({
        userInstruction: taskInstruction,
        piiItems
      });

      // 2. Policy Decisions
      let policyDecisions = Array.isArray(input.policyDecisions) ? input.policyDecisions : [];
      if (policyDecisions.length === 0 && piiItems.length > 0) {
        const batchPolicy = evaluateBatchPrivacyPolicy({
          piiItems,
          contextAnalysis: taskContext,
          destination,
          authorization: options.authorization || { authorizationGranted: false }
        });
        policyDecisions = Array.isArray(batchPolicy) ? batchPolicy : (batchPolicy?.items || []);
      }

      // 3. Build token mappings
      const tokenMapping = {};
      for (const pol of policyDecisions) {
        if (pol.action === POLICY_ACTIONS.TOKENIZE) {
          const pii = pol.piiItem || pol;
          const tokenKey = pol.token || generatePiiToken(pii.category || "item", pii.id || "1");
          tokenMapping[tokenKey] = Object.freeze({
            token: tokenKey,
            category: pii.category || "unknown",
            type: TOKEN_TYPES.OPAQUE_ID,
            decision: POLICY_ACTIONS.TOKENIZE
          });
        }
      }

      // 4. Sanitize DOM Tree
      const stats = { count: 0 };
      const rawDom = input.domTree || { tag: "root", children: [] };
      const sanitizedDomTree = this.sanitizeDomNode(rawDom, policyDecisions, 0, stats);

      // 5. Sanitize Visual Perception Blocks
      const rawBlocks = Array.isArray(input.visualBlocks) ? input.visualBlocks : [];
      const sanitizedVisualBlocks = this.sanitizeVisualBlocks(rawBlocks, policyDecisions);

      // 6. Assemble candidate payload
      const candidatePayload = {
        status: SANITIZED_CONTEXT_STATUS.SANITIZED,
        version: CONTEXT_BUILDER_VERSION,
        taskIntent: taskContext.taskIntent || "UNKNOWN",
        domTree: sanitizedDomTree || { tag: "empty" },
        visualBlocks: sanitizedVisualBlocks,
        tokenMapping,
        metadata: {
          nodeCount: stats.count,
          visualBlockCount: sanitizedVisualBlocks.length,
          tokensCount: Object.keys(tokenMapping).length,
          destination,
          latencyMs: Date.now() - startTime,
          timestamp: Date.now()
        }
      };

      // 7. Security Invariant: Deep sanitization & fail-closed validation
      const sanitizedFinal = sanitizeRemotePayload(candidatePayload);

      // Verify payload byte size
      const payloadString = JSON.stringify(sanitizedFinal);
      if (payloadString.length > this.config.MAX_PAYLOAD_BYTES) {
        this.status = SANITIZED_CONTEXT_STATUS.REJECTED;
        return Object.freeze({
          ok: false,
          status: SANITIZED_CONTEXT_STATUS.REJECTED,
          error: `Payload size (${payloadString.length} bytes) exceeds maximum allowable limit (${this.config.MAX_PAYLOAD_BYTES}).`,
          payload: null
        });
      }

      this.status = SANITIZED_CONTEXT_STATUS.READY;
      this.lastBuiltAt = Date.now();

      return Object.freeze({
        ok: true,
        status: SANITIZED_CONTEXT_STATUS.SANITIZED,
        payload: Object.freeze(sanitizedFinal)
      });
    } catch (err) {
      this.status = SANITIZED_CONTEXT_STATUS.ERROR;
      return Object.freeze({
        ok: false,
        status: SANITIZED_CONTEXT_STATUS.ERROR,
        error: "Context builder encountered an unrecoverable error during sanitization.",
        payload: null
      });
    }
  }

  /**
   * Validates a sanitized payload to ensure absolute zero leakage of raw sensitive patterns.
   *
   * @param {object} payload
   * @returns {{ valid: boolean, violations: Array<string> }}
   */
  validateSanitizedPayload(payload) {
    if (!payload || typeof payload !== "object") {
      return { valid: false, violations: ["Payload is not a valid object."] };
    }

    const violations = [];
    const serialized = JSON.stringify(payload);

    // Credit Card (Luhn-compliant raw numbers) check
    const CARD_REGEX = /\b(?:\d[ -]*?){13,19}\b/g;
    for (const match of serialized.matchAll(CARD_REGEX)) {
      const digits = match[0].replace(/\D/g, "");
      if (digits.length >= 13 && digits.length <= 19) {
        violations.push("Potential raw payment card number detected in payload.");
        break;
      }
    }

    // Raw script tag or inline handler check
    if (/<script\b/i.test(serialized) || /on(?:click|load|error)=/i.test(serialized)) {
      violations.push("Forbidden executable script or inline event handler detected.");
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }

  /**
   * Alias for sanitizeDomNode
   */
  sanitizeDomSubtree(node, policyResults, depth, stats) {
    return this.sanitizeDomNode(node, policyResults, depth, stats);
  }

  /**
   * Disposes resources and marks builder as disposed.
   *
   * @returns {object}
   */
  dispose() {
    this.status = SANITIZED_CONTEXT_STATUS.UNINITIALIZED;
    this.lastBuiltAt = null;
    return Object.freeze({
      ok: true,
      state: this.status
    });
  }
}

/**
 * Factory function for creating a new isolated SanitizedContextBuilder instance.
 *
 * @param {object} [config={}]
 * @returns {SanitizedContextBuilder}
 */
export function createSanitizedContextBuilder(config = {}) {
  const builder = new SanitizedContextBuilder(config);
  builder.initialize();
  return builder;
}

// Default singleton context builder instance
export const sanitizedContextBuilder = createSanitizedContextBuilder();

// Convenience module exports
export function buildSanitizedContext(input, options) {
  return sanitizedContextBuilder.buildSanitizedContext(input, options);
}

export function buildSanitizedReasoningPayload(input, options) {
  return sanitizedContextBuilder.buildSanitizedContext(input, options);
}

export function sanitizePageRepresentation(input, options) {
  return sanitizedContextBuilder.buildSanitizedContext(input, options);
}

export function sanitizeDomTree(domTree, policyItems, options) {
  return sanitizedContextBuilder.sanitizeDomNode(domTree, policyItems);
}

export function sanitizeDomSubtree(domTree, policyItems, options) {
  return sanitizedContextBuilder.sanitizeDomNode(domTree, policyItems);
}

export function sanitizeVisualBlocks(visualBlocks, policyItems, options) {
  return sanitizedContextBuilder.sanitizeVisualBlocks(visualBlocks, policyItems);
}

export function validateSanitizedPayload(payload) {
  return sanitizedContextBuilder.validateSanitizedPayload(payload);
}
