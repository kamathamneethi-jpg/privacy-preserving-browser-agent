/**
 * Spatial & multi-signal fusion engine for PII detections.
 * Fuses overlapping DOM, OCR, and semantic field detections into unified entities.
 */
import { calculateMultiSignalConfidence, DETECTION_CONFIG, EVIDENCE_GROUPS } from "./config.js";
import { createLocalizedPiiItem, generatePiiId } from "./localization.js";

/**
 * Computes bounding box spatial intersection area.
 */
function getBoxIntersectionArea(boxA, boxB) {
  if (!boxA || !boxB) return 0;
  const xOverlap = Math.max(0, Math.min(boxA.x + boxA.width, boxB.x + boxB.width) - Math.max(boxA.x, boxB.x));
  const yOverlap = Math.max(0, Math.min(boxA.y + boxA.height, boxB.y + boxB.height) - Math.max(boxA.y, boxB.y));
  return xOverlap * yOverlap;
}

/**
 * Checks if two bounding boxes spatially overlap or are in close proximity.
 */
export function areBoundingBoxesOverlapping(boxA, boxB) {
  if (!boxA || !boxB) return false;
  const areaA = boxA.width * boxA.height;
  const areaB = boxB.width * boxB.height;
  const minArea = Math.min(areaA, areaB);
  const interArea = getBoxIntersectionArea(boxA, boxB);

  if (minArea > 0 && interArea / minArea >= DETECTION_CONFIG.FUSION_SPATIAL_OVERLAP_THRESHOLD) {
    return true;
  }

  // Proximity check for 0-height or tiny rects
  const centerAX = boxA.x + boxA.width / 2;
  const centerAY = boxA.y + boxA.height / 2;
  const centerBX = boxB.x + boxB.width / 2;
  const centerBY = boxB.y + boxB.height / 2;

  const dx = Math.abs(centerAX - centerBX);
  const dy = Math.abs(centerAY - centerBY);

  return dx <= DETECTION_CONFIG.FUSION_PROXIMITY_PX && dy <= DETECTION_CONFIG.FUSION_PROXIMITY_PX;
}

/**
 * Computes enclosing bounding box for a set of boxes.
 */
function getEnclosingBoundingBox(boxes) {
  const validBoxes = boxes.filter(Boolean);
  if (!validBoxes.length) return { x: 0, y: 0, width: 0, height: 0 };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const box of validBoxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }

  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY)
  };
}

/**
 * Normalizes category names for matching (e.g., email_field -> email).
 */
function normalizeCategory(category) {
  const safe = String(category || "").toLowerCase();
  if (safe.includes("email")) return "email";
  if (safe.includes("phone")) return "phone";
  if (safe.includes("payment") || safe.includes("card")) return "payment_card";
  if (safe.includes("password")) return "password_field";
  if (safe.includes("otp")) return "otp";
  return safe;
}

/**
 * Fuses array of detected items (DOM, OCR, semantic) based on category, spatial overlap, and evidence.
 *
 * @param {Array<object>} items
 * @returns {Array<object>} Fused LocalizedPiiItem objects
 */
export function fuseDetectedPiiItems(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const remaining = [...items];
  const fusedResults = [];

  while (remaining.length > 0) {
    const current = remaining.shift();
    const currentNormCategory = normalizeCategory(current.category);
    const cluster = [current];

    let index = 0;
    while (index < remaining.length) {
      const candidate = remaining[index];
      const candidateNormCategory = normalizeCategory(candidate.category);

      const sameCategory = currentNormCategory === candidateNormCategory;
      const overlaps = areBoundingBoxesOverlapping(current.bbox, candidate.bbox);

      if (sameCategory && overlaps) {
        cluster.push(candidate);
        remaining.splice(index, 1);
      } else {
        index += 1;
      }
    }

    // Determine sources and independent evidence groups present
    const sources = new Set(cluster.map((c) => c.source).filter(Boolean));
    const evidenceGroups = new Set();

    for (const item of cluster) {
      if (Array.isArray(item.evidence)) {
        for (const eg of item.evidence) evidenceGroups.add(eg);
      } else {
        if (item.source === "dom") evidenceGroups.add(EVIDENCE_GROUPS.DOM_SEMANTIC);
        if (item.source === "ocr") evidenceGroups.add(EVIDENCE_GROUPS.OCR_VISUAL);
        if (item.hasLuhn) evidenceGroups.add(EVIDENCE_GROUPS.CHECKSUM);
        evidenceGroups.add(EVIDENCE_GROUPS.PATTERN);
      }
    }

    const primaryCategory = cluster[0].category;
    const finalSource = sources.size > 1 ? "fusion" : (cluster[0].source || "dom");
    const combinedConfidence = calculateMultiSignalConfidence(primaryCategory, Array.from(evidenceGroups));
    const enclosingBbox = getEnclosingBoundingBox(cluster.map((c) => c.bbox));

    const fusedItem = createLocalizedPiiItem({
      id: generatePiiId(finalSource.toUpperCase()),
      category: primaryCategory,
      confidence: combinedConfidence,
      bbox: enclosingBbox,
      source: finalSource,
      placeholder: `[${primaryCategory.toUpperCase()}_REDACTED]`
    });

    fusedResults.push(fusedItem);
  }

  return fusedResults;
}
