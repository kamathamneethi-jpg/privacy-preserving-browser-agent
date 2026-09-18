import { PrivacyDecision, decidePrivacyPolicy } from "./policy.js";
import { PiiCategory, EVIDENCE_GROUPS, calculateMultiSignalConfidence } from "./config.js";
import { createLocalizedPiiItem, generatePiiId } from "./localization.js";
import { analyzeDomElementSemantics } from "./dom-semantics.js";
import { fuseDetectedPiiItems } from "./fusion.js";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?:\+?\d[\d(). -]{7,}\d)/g;
const CARD_PATTERN = /(?:\d[ -]*?){13,19}/g;
const OTP_PATTERN = /\b(?:\d{4,8}|[A-Z0-9]{6})\b/gi;
const ACCOUNT_ID_PATTERN = /\b(?:[A-Z]{2}\d{2}[A-Z0-9]{11,30}|ACC-[A-Z0-9]{6,12})\b/gi;
const PERSON_NAME_PATTERN = /\b(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
const ADDRESS_PATTERN = /\b\d{1,5}\s+[A-Z][a-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln)\b/gi;

export { PiiCategory };

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

function countPattern(text, pattern, predicate = () => true) {
  pattern.lastIndex = 0;
  let count = 0;
  for (const match of text.matchAll(pattern)) {
    if (predicate(match[0])) count += 1;
  }
  return count;
}

/**
 * Inspects text transiently and returns only counts. It never returns a matched value.
 */
export function scanTextForPii(text) {
  const safeText = typeof text === "string" ? text : "";
  return {
    [PiiCategory.EMAIL]: countPattern(safeText, EMAIL_PATTERN),
    [PiiCategory.PHONE]: countPattern(safeText, PHONE_PATTERN),
    [PiiCategory.PAYMENT_CARD]: countPattern(safeText, CARD_PATTERN, passesLuhn)
  };
}

export function summarizeSensitiveCategories(counts) {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([category, count]) => ({
      category,
      count,
      decision: decidePrivacyPolicy({ classification: "sensitive", purpose: "remote_reasoning" }).decision
    }));
}

function isValidPhoneCandidate(candidate) {
  const digits = candidate.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * Returns structural match index locations for text without storing raw sensitive values in returned summary.
 */
export function findPiiMatches(text) {
  const safeText = typeof text === "string" ? text : "";
  const matches = [];

  const patterns = [
    { category: PiiCategory.EMAIL, pattern: EMAIL_PATTERN, baseConfidence: 0.85 },
    { category: PiiCategory.PHONE, pattern: PHONE_PATTERN, baseConfidence: 0.75, predicate: isValidPhoneCandidate },
    { category: PiiCategory.PAYMENT_CARD, pattern: CARD_PATTERN, baseConfidence: 0.70, predicate: passesLuhn, hasLuhn: true },
    { category: PiiCategory.ACCOUNT_IDENTIFIER, pattern: ACCOUNT_ID_PATTERN, baseConfidence: 0.50 },
    { category: PiiCategory.PERSON_NAME, pattern: PERSON_NAME_PATTERN, baseConfidence: 0.45 },
    { category: PiiCategory.ADDRESS, pattern: ADDRESS_PATTERN, baseConfidence: 0.50 }
  ];

  for (const { category, pattern, baseConfidence, predicate, hasLuhn } of patterns) {
    pattern.lastIndex = 0;
    for (const match of safeText.matchAll(pattern)) {
      if (!predicate || predicate(match[0])) {
        const evidenceGroups = [EVIDENCE_GROUPS.PATTERN];
        if (hasLuhn) evidenceGroups.push(EVIDENCE_GROUPS.CHECKSUM);
        const confidence = calculateMultiSignalConfidence(category, evidenceGroups);

        matches.push({
          category,
          index: match.index,
          length: match[0].length,
          confidence,
          hasLuhn: Boolean(hasLuhn),
          evidence: evidenceGroups
        });
      }
    }
  }

  // Suppress lower priority overlapping matches (e.g. card or account ID suppressing phone overlap)
  const dominantMatches = matches.filter((m) => m.category === PiiCategory.PAYMENT_CARD || m.category === PiiCategory.ACCOUNT_IDENTIFIER);
  if (dominantMatches.length > 0) {
    return matches.filter((m) => {
      if (m.category === PiiCategory.PAYMENT_CARD || m.category === PiiCategory.ACCOUNT_IDENTIFIER) return true;
      const overlapsDominant = dominantMatches.some(
        (d) => Math.max(d.index, m.index) < Math.min(d.index + d.length, m.index + m.length)
      );
      return !overlapsDominant;
    });
  }

  return matches;
}

/**
 * Recombines horizontally split OCR text blocks on the same line prior to matching.
 */
export function reconstructOcrFragments(ocrBlocks) {
  if (!Array.isArray(ocrBlocks) || ocrBlocks.length === 0) return [];

  const sorted = [...ocrBlocks].sort((a, b) => {
    const yDiff = (a.bbox?.y || 0) - (b.bbox?.y || 0);
    return Math.abs(yDiff) > 8 ? yDiff : (a.bbox?.x || 0) - (b.bbox?.x || 0);
  });

  const reconstructed = [];
  let currentGroup = null;

  for (const block of sorted) {
    if (!block || typeof block.text !== "string") continue;
    const bbox = block.bbox || { x: 0, y: 0, width: 0, height: 0 };

    if (!currentGroup) {
      currentGroup = { text: block.text, bbox: { ...bbox }, confidence: block.confidence || 90 };
      continue;
    }

    const sameLine = Math.abs(bbox.y - currentGroup.bbox.y) <= 8;
    const closeX = bbox.x - (currentGroup.bbox.x + currentGroup.bbox.width) <= 25;

    if (sameLine && closeX) {
      const joinWithoutSpace = /[a-zA-Z0-9]$/.test(currentGroup.text) && /^[@._-]/.test(block.text);
      currentGroup.text += (joinWithoutSpace ? "" : " ") + block.text;
      currentGroup.bbox.width = (bbox.x + bbox.width) - currentGroup.bbox.x;
      currentGroup.bbox.height = Math.max(currentGroup.bbox.height, bbox.height);
      currentGroup.confidence = Math.min(currentGroup.confidence, block.confidence || 90);
    } else {
      reconstructed.push(currentGroup);
      currentGroup = { text: block.text, bbox: { ...bbox }, confidence: block.confidence || 90 };
    }
  }

  if (currentGroup) reconstructed.push(currentGroup);
  return reconstructed;
}

/**
 * Processes OCR recognized blocks (including fragment reconstruction) into localized PII items.
 */
export function processOcrResult(ocrBlocks) {
  if (!Array.isArray(ocrBlocks)) return [];
  const reconstructed = reconstructOcrFragments(ocrBlocks);
  const results = [];

  for (const block of reconstructed) {
    if (!block || typeof block.text !== "string") continue;
    const matches = findPiiMatches(block.text);

    for (const match of matches) {
      const evidence = [EVIDENCE_GROUPS.PATTERN, EVIDENCE_GROUPS.OCR_VISUAL];
      if (match.hasLuhn) evidence.push(EVIDENCE_GROUPS.CHECKSUM);
      const confidence = calculateMultiSignalConfidence(match.category, evidence);

      results.push({
        id: generatePiiId("OCR"),
        category: match.category,
        confidence,
        bbox: block.bbox || { x: 0, y: 0, width: 0, height: 0 },
        source: "ocr",
        evidence,
        placeholder: `[${match.category.toUpperCase()}_OCR_REDACTED]`
      });
    }
  }

  return results;
}

/**
 * High-level multi-signal detection and fusion API for Step 6.
 * Merges DOM items, OCR items, and DOM semantic element detections.
 */
export function detectPiiMultiSignal({ domItems = [], ocrBlocks = [], domElements = [] } = {}) {
  const rawDetections = [];

  // 1. Process DOM items
  if (Array.isArray(domItems)) {
    for (const item of domItems) {
      if (item && item.category) {
        rawDetections.push({
          ...item,
          source: item.source || "dom",
          evidence: [EVIDENCE_GROUPS.PATTERN, EVIDENCE_GROUPS.DOM_SEMANTIC]
        });
      }
    }
  }

  // 2. Process DOM elements with semantic attributes
  if (Array.isArray(domElements)) {
    for (const elem of domElements) {
      const semantic = analyzeDomElementSemantics(elem);
      if (semantic) {
        const evidence = [EVIDENCE_GROUPS.DOM_SEMANTIC];
        const confidence = calculateMultiSignalConfidence(semantic.category, evidence);
        rawDetections.push({
          id: generatePiiId("DOM_SEM"),
          category: semantic.category,
          confidence,
          bbox: elem.bbox || { x: 0, y: 0, width: 0, height: 0 },
          source: "dom",
          evidence,
          placeholder: `[${semantic.category.toUpperCase()}_REDACTED]`
        });
      }
    }
  }

  // 3. Process OCR blocks
  if (Array.isArray(ocrBlocks) && ocrBlocks.length > 0) {
    const ocrItems = processOcrResult(ocrBlocks);
    rawDetections.push(...ocrItems);
  }

  // 4. Perform Spatial & Multi-Signal Fusion
  return fuseDetectedPiiItems(rawDetections);
}

export {
  PrivacyDecision,
  analyzeDomElementSemantics,
  fuseDetectedPiiItems
};
export { extractDomTextNodes } from "./dom-extractor.js";
export { glinerAdapter, GlinerAdapter } from "./gliner-adapter.js";
export { hybridPiiDetector, HybridPiiDetector } from "./hybrid-pii-detector.js";
export { redactTextString, redactDomNodes } from "./dom-redactor.js";
export { GLINER_MODEL_METADATA, GLINER_CONFIG, GLINER_TARGET_LABELS, GLINER_TAXONOMY_MAP } from "./gliner-config.js";
