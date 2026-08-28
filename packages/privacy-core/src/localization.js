/**
 * Formats a normalized LocalizedPiiItem object.
 * Raw sensitive values are intentionally omitted or replaced with redacted placeholders.
 */
let piiCounter = 0;

export function generatePiiId(prefix = "PII") {
  piiCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${piiCounter}`;
}

/**
 * Creates a normalized localized PII item object.
 *
 * @param {object} params
 * @param {string} params.category - PII Category (e.g. "email", "phone", "payment_card", "password_field")
 * @param {number} [params.confidence=0.95] - Confidence score (0.0 to 1.0)
 * @param {{ x: number, y: number, width: number, height: number }} params.bbox - Spatial bounding box
 * @param {"dom" | "ocr" | "fusion"} params.source - Origin signal
 * @param {string} [params.id] - Optional custom item ID
 * @param {string} [params.placeholder] - Safe redacted placeholder marker
 * @returns {object} LocalizedPiiItem
 */
export function createLocalizedPiiItem({
  category,
  confidence = 0.95,
  bbox = { x: 0, y: 0, width: 0, height: 0 },
  source = "dom",
  id,
  placeholder
}) {
  const itemId = id || generatePiiId(source.toUpperCase());
  const safeCategory = String(category || "unknown").toLowerCase();
  const safePlaceholder = placeholder || `[${safeCategory.toUpperCase()}_REDACTED]`;

  const numConf = Math.min(1.0, Math.max(0.0, Number(confidence) || 0.9));
  return Object.freeze({
    id: itemId,
    category: safeCategory,
    confidence: Math.round((numConf + Number.EPSILON) * 100) / 100,
    bbox: Object.freeze({
      x: Math.round(Number(bbox.x) || 0),
      y: Math.round(Number(bbox.y) || 0),
      width: Math.round(Number(bbox.width) || 0),
      height: Math.round(Number(bbox.height) || 0)
    }),
    source: String(source),
    placeholder: safePlaceholder
  });
}

/**
 * Sanitizes localized items to ensure no raw sensitive text property is present.
 */
export function sanitizeLocalizedItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    // Strip any raw text property if accidentally present
    const { rawValue, text, matchedText, ...safeItem } = item;
    return createLocalizedPiiItem(safeItem);
  });
}
