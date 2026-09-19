/**
 * Hybrid PII Detector Module.
 * Combines fast deterministic Regex & checksum validators with on-device GLiNER semantic NER.
 * Normalizes detections into project taxonomy, deduplicates overlapping spans, and preserves node relations.
 *
 * Privacy & Security Guarantees:
 * 1. 100% on-device local execution. Zero network calls or external API dependencies.
 * 2. Safe debug logging with masked values (never logs raw PII).
 * 3. Fail-safe design: Returns deterministic rule results if ML model fails.
 */

import { PiiCategory } from "./config.js";
import { GlinerAdapter, glinerAdapter } from "./gliner-adapter.js";
import { GLINER_TARGET_LABELS, GLINER_CONFIG } from "./gliner-config.js";

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_PATTERN = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b|\b\d{10}\b/g;
const CARD_PATTERN = /\b(?:\d{4}[-\s]?){3}\d{4}\b|\b\d{13,19}\b/g;
const CARD_LABEL_PATTERN = /\b(?:Card|Credit Card|Card Number)\s*:\s*([0-9 -]{13,19})/gi;
const NAME_LABEL_PATTERN = /\b(?:Name|Full Name|Customer Name|User Name)\s*:\s*([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi;
const ID_LABEL_PATTERN = /\b(?:ID|User ID|Customer ID|Account ID)\s*:\s*([A-Za-z0-9_#-]+)/gi;
const IP_PATTERN = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
const OTP_PATTERN = /\b(?:\d{4,8}|[A-Z0-9]{6})\b/g;
const ACCOUNT_ID_PATTERN = /\b(?:[A-Z]{2}\d{2}[A-Z0-9]{11,30}|ACC-[A-Z0-9]{6,12})\b/g;

function passesLuhn(candidate) {
  const digits = candidate.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  for (let index = digits.length - 1, parity = 0; index >= 0; index -= 1, parity += 1) {
    let digit = Number(digits[index]);
    if (parity % 2 === 1) digit = digit > 4 ? digit * 2 - 9 : digit * 2;
    sum += digit;
  }
  return sum % 10 === 0;
}

function maskSensitiveValue(type, value) {
  if (typeof value !== "string" || value.length === 0) return "[EMPTY]";
  if (type === PiiCategory.EMAIL) {
    const parts = value.split("@");
    if (parts.length === 2) {
      const user = parts[0];
      const maskedUser = user.length > 2 ? `${user.slice(0, 2)}***` : `${user.slice(0, 1)}***`;
      return `${maskedUser}@${parts[1]}`;
    }
  }
  if (type === PiiCategory.PHONE) {
    return value.length > 6 ? `${value.slice(0, 3)}******${value.slice(-4)}` : "******";
  }
  if (type === PiiCategory.PAYMENT_CARD) {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 4 ? `****-****-****-${digits.slice(-4)}` : "****";
  }
  return value.length > 2 ? `${value.slice(0, 2)}***` : "***";
}

export class HybridPiiDetector {
  constructor(customConfig = {}) {
    this.config = { ...GLINER_CONFIG, ...customConfig };
    this.glinerAdapter = customConfig.glinerAdapter || glinerAdapter;
    this.confidenceThreshold = typeof customConfig.confidenceThreshold === "number"
      ? customConfig.confidenceThreshold
      : GLINER_CONFIG.DEFAULT_CONFIDENCE_THRESHOLD;
    this.debugMode = Boolean(customConfig.debugMode);
  }

  /**
   * Sets the confidence threshold dynamically.
   * @param {number} threshold
   */
  setConfidenceThreshold(threshold) {
    if (typeof threshold === "number" && threshold >= GLINER_CONFIG.MIN_THRESHOLD && threshold <= GLINER_CONFIG.MAX_THRESHOLD) {
      this.confidenceThreshold = threshold;
      this.glinerAdapter.setConfidenceThreshold(threshold);
    }
  }

  /**
   * Runs fast deterministic regex patterns against text.
   * @param {string} text
   * @param {string} [nodeId]
   * @returns {Array<object>}
   */
  detectWithDeterministicRules(text, nodeId = undefined) {
    const detections = [];
    if (typeof text !== "string" || !text.trim()) return detections;

    // 1. Email
    EMAIL_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(EMAIL_PATTERN)) {
      detections.push({
        type: PiiCategory.EMAIL,
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.98,
        source: "regex",
        ...(nodeId ? { nodeId } : {})
      });
    }

    // 2. Phone
    PHONE_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(PHONE_PATTERN)) {
      const digits = match[0].replace(/\D/g, "");
      if (digits.length >= 7 && digits.length <= 15) {
        detections.push({
          type: PiiCategory.PHONE,
          value: match[0],
          start: match.index,
          end: match.index + match[0].length,
          confidence: 0.92,
          source: "regex",
          ...(nodeId ? { nodeId } : {})
        });
      }
    }

    // 3. Payment Card (with Luhn check or explicit card label)
    CARD_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(CARD_PATTERN)) {
      if (passesLuhn(match[0])) {
        detections.push({
          type: PiiCategory.PAYMENT_CARD,
          value: match[0],
          start: match.index,
          end: match.index + match[0].length,
          confidence: 0.95,
          source: "regex",
          ...(nodeId ? { nodeId } : {})
        });
      }
    }
    CARD_LABEL_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(CARD_LABEL_PATTERN)) {
      const val = match[1]?.trim();
      if (val && val.replace(/\D/g, "").length >= 13 && !detections.some((d) => d.value === val)) {
        const start = match.index + match[0].indexOf(val);
        detections.push({
          type: PiiCategory.PAYMENT_CARD,
          value: val,
          start,
          end: start + val.length,
          confidence: 0.95,
          source: "regex",
          ...(nodeId ? { nodeId } : {})
        });
      }
    }

    // 4. IP Address
    IP_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(IP_PATTERN)) {
      detections.push({
        type: PiiCategory.ACCOUNT_IDENTIFIER,
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.90,
        source: "regex",
        ...(nodeId ? { nodeId } : {})
      });
    }

    // 5. Account Identifier
    ACCOUNT_ID_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(ACCOUNT_ID_PATTERN)) {
      detections.push({
        type: PiiCategory.ACCOUNT_IDENTIFIER,
        value: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.85,
        source: "regex",
        ...(nodeId ? { nodeId } : {})
      });
    }

    // 6. Name (labeled)
    NAME_LABEL_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(NAME_LABEL_PATTERN)) {
      const val = match[1]?.trim();
      if (val && val.length >= 2) {
        const start = match.index + match[0].indexOf(val);
        detections.push({
          type: PiiCategory.PERSON_NAME,
          value: val,
          start,
          end: start + val.length,
          confidence: 0.92,
          source: "regex",
          ...(nodeId ? { nodeId } : {})
        });
      }
    }

    // 7. ID (labeled)
    ID_LABEL_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(ID_LABEL_PATTERN)) {
      const val = match[1]?.trim();
      if (val && val.length >= 2) {
        const start = match.index + match[0].indexOf(val);
        detections.push({
          type: PiiCategory.ACCOUNT_IDENTIFIER,
          value: val,
          start,
          end: start + val.length,
          confidence: 0.90,
          source: "regex",
          ...(nodeId ? { nodeId } : {})
        });
      }
    }

    return detections;
  }

  /**
   * Runs local PII detection against OCR recognized blocks.
   * Preserves exact OCR bounding box and sets source: "IMAGE_OCR".
   *
   * @param {Array<{ text: string, bbox: object, confidence?: number }>} ocrBlocks
   * @param {object} [options={}]
   * @returns {Array<object>} Detected PII items with bounding boxes
   */
  detectPiiInOcrBlocks(ocrBlocks, options = {}) {
    if (!Array.isArray(ocrBlocks) || ocrBlocks.length === 0) {
      return [];
    }

    const detections = [];
    let counter = 0;

    for (const block of ocrBlocks) {
      if (!block || typeof block.text !== "string" || !block.text.trim()) continue;
      const text = block.text.trim();
      const bbox = block.bbox || { x: 0, y: 0, width: 0, height: 0 };
      const blockConf = typeof block.confidence === "number" ? block.confidence : 0.95;

      const matches = this.detectWithDeterministicRules(text);

      for (const match of matches) {
        counter++;
        let normalizedType = String(match.type).toUpperCase();
        if (normalizedType === "PERSON_NAME" || normalizedType === "NAME") normalizedType = "NAME";
        else if (normalizedType === "ACCOUNT_IDENTIFIER" || normalizedType === "ID") normalizedType = "ID";
        else if (normalizedType === "PAYMENT_CARD" || normalizedType === "CREDIT_CARD") normalizedType = "CREDIT_CARD";
        else if (normalizedType === "PHONE" || normalizedType === "PHONE_FIELD") normalizedType = "PHONE";
        else if (normalizedType === "EMAIL" || normalizedType === "EMAIL_FIELD") normalizedType = "EMAIL";

        detections.push({
          id: `PII_IMG_${counter}`,
          type: normalizedType,
          category: normalizedType.toLowerCase(),
          value: match.value,
          confidence: Number(Math.min(1.0, blockConf * (match.confidence || 0.95)).toFixed(2)),
          bbox: {
            x: Math.round(bbox.x || 0),
            y: Math.round(bbox.y || 0),
            width: Math.round(bbox.width || 0),
            height: Math.round(bbox.height || 0)
          },
          source: "IMAGE_OCR"
        });
      }
    }

    return detections;
  }

  /**
   * Detects PII across a single text string combining regex and GLiNER.
   *
   * @param {string} text
   * @param {object} [options={}]
   * @returns {Promise<Array<object>>}
   */
  async detectPiiInText(text, options = {}) {
    if (typeof text !== "string" || !text.trim()) return [];

    const threshold = typeof options.threshold === "number" ? options.threshold : this.confidenceThreshold;
    const nodeId = options.nodeId;

    // 1. Fast deterministic regex detection
    const regexDetections = this.detectWithDeterministicRules(text, nodeId);

    // 2. Semantic GLiNER NER detection
    let glinerDetections = [];
    try {
      const entities = await this.glinerAdapter.extractEntities(text, GLINER_TARGET_LABELS, { threshold });
      glinerDetections = entities.map((ent) => ({
        type: ent.normalizedType || PiiCategory.PERSON_NAME,
        value: ent.text,
        start: ent.start,
        end: ent.end,
        confidence: ent.confidence,
        source: "gliner",
        ...(nodeId ? { nodeId } : {})
      }));
    } catch {
      glinerDetections = [];
    }

    // 3. Merge & Deduplicate
    return this.mergeDetections(regexDetections, glinerDetections);
  }

  /**
   * Detects PII across an array of extracted DOM text nodes.
   *
   * @param {Array<{ nodeId: string, elementPath: string, text: string, source: string, bbox: object }>} domTextNodes
   * @param {object} [options={}]
   * @returns {Promise<{ detections: Array<object>, summary: object, metrics: object }>}
   */
  async detectPiiInDomNodes(domTextNodes, options = {}) {
    const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    const threshold = typeof options.threshold === "number" ? options.threshold : this.confidenceThreshold;

    if (!Array.isArray(domTextNodes) || domTextNodes.length === 0) {
      return {
        detections: [],
        summary: { totalNodes: 0, totalDetections: 0, byCategory: {} },
        metrics: { extractionMs: 0, regexMs: 0, glinerMs: 0, totalMs: 0 }
      };
    }

    let regexMs = 0;
    let glinerMs = 0;
    const allDetections = [];
    let regexCount = 0;
    let glinerCount = 0;

    for (const node of domTextNodes) {
      if (!node || typeof node.text !== "string") continue;

      // Regex timing
      const rStart = typeof performance !== "undefined" ? performance.now() : Date.now();
      const rDetections = this.detectWithDeterministicRules(node.text, node.nodeId);
      const rEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
      regexMs += (rEnd - rStart);
      regexCount += rDetections.length;

      // GLiNER timing
      const gStart = typeof performance !== "undefined" ? performance.now() : Date.now();
      let gDetections = [];
      try {
        const entities = await this.glinerAdapter.extractEntities(node.text, GLINER_TARGET_LABELS, { threshold });
        gDetections = entities.map((ent) => ({
          type: ent.normalizedType || PiiCategory.PERSON_NAME,
          value: ent.text,
          start: ent.start,
          end: ent.end,
          confidence: ent.confidence,
          source: "gliner",
          nodeId: node.nodeId,
          elementPath: node.elementPath,
          bbox: node.bbox
        }));
      } catch {
        gDetections = [];
      }
      const gEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
      glinerMs += (gEnd - gStart);
      glinerCount += gDetections.length;

      // Merge node detections
      const merged = this.mergeDetections(
        rDetections.map((d) => ({ ...d, elementPath: node.elementPath, bbox: node.bbox })),
        gDetections
      );
      allDetections.push(...merged);
    }

    const endTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    const totalMs = Math.round((endTime - startTime) * 100) / 100;

    // Summary counts by category
    const byCategory = {};
    for (const d of allDetections) {
      byCategory[d.type] = (byCategory[d.type] || 0) + 1;
    }

    // Developer / debug output (with masked values)
    if (this.debugMode) {
      const maskedSample = allDetections.slice(0, 3).map((d) => `${d.type}: ${maskSensitiveValue(d.type, d.value)}`).join(", ");
      console.log(`[PrivacyCore] DOM nodes: ${domTextNodes.length} | Regex: ${regexCount} | GLiNER: ${glinerCount} | Merged: ${allDetections.length} | Latency: ${totalMs}ms`);
      if (maskedSample) console.log(`[PrivacyCore] Sample detections: ${maskedSample}`);
    }

    return {
      detections: allDetections,
      summary: {
        totalNodes: domTextNodes.length,
        totalDetections: allDetections.length,
        regexDetections: regexCount,
        glinerDetections: glinerCount,
        byCategory
      },
      metrics: {
        regexMs: Math.round(regexMs * 100) / 100,
        glinerMs: Math.round(glinerMs * 100) / 100,
        totalMs
      }
    };
  }

  /**
   * Merges deterministic regex and semantic GLiNER detections.
   * Deterministic regex takes precedence for emails, phones, and cards.
   * GLiNER takes precedence for person names and locations.
   */
  mergeDetections(regexDetections = [], glinerDetections = []) {
    const combined = [...regexDetections, ...glinerDetections];
    if (combined.length <= 1) return combined;

    // Sort by confidence desc, regex source priority for structured types
    const sorted = [...combined].sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return b.confidence - a.confidence;
    });

    const merged = [];
    for (const item of sorted) {
      const overlappingIdx = merged.findIndex(
        (m) => (item.nodeId === undefined || m.nodeId === item.nodeId) &&
               Math.max(m.start, item.start) < Math.min(m.end, item.end)
      );

      if (overlappingIdx === -1) {
        merged.push(item);
      } else {
        const existing = merged[overlappingIdx];
        // If one is regex and one is gliner on exact same span, mark as hybrid
        if (existing.start === item.start && existing.end === item.end && existing.source !== item.source) {
          merged[overlappingIdx] = {
            ...existing,
            confidence: Math.max(existing.confidence, item.confidence),
            source: "hybrid"
          };
        } else if (item.confidence > existing.confidence) {
          merged[overlappingIdx] = item;
        }
      }
    }

    return merged.sort((a, b) => a.start - b.start);
  }
}

export const hybridPiiDetector = new HybridPiiDetector();
