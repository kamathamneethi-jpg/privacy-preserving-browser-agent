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

/**
 * Transforms a viewport-relative CSS bounding box into canonical bitmap pixel coordinates.
 * Accounts for devicePixelRatio and image bitmap scaling.
 *
 * @param {{ x: number, y: number, width: number, height: number }} bbox
 * @param {object} context
 * @param {number} [context.viewportWidth=1280] - Viewport width in CSS pixels
 * @param {number} [context.viewportHeight=800] - Viewport height in CSS pixels
 * @param {number} [context.bitmapWidth] - Natural bitmap image width in device pixels
 * @param {number} [context.bitmapHeight] - Natural bitmap image height in device pixels
 * @param {number} [context.devicePixelRatio=1] - Window device pixel ratio
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function transformViewportToBitmap(bbox, context = {}) {
  if (!bbox || typeof bbox !== "object") {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const vw = Math.max(1, Number(context.viewportWidth) || 1280);
  const vh = Math.max(1, Number(context.viewportHeight) || 800);
  const dpr = Math.max(0.1, Number(context.devicePixelRatio) || 1);
  const bw = Math.max(1, Number(context.bitmapWidth) || Math.round(vw * dpr));
  const bh = Math.max(1, Number(context.bitmapHeight) || Math.round(vh * dpr));

  const scaleX = bw / vw;
  const scaleY = bh / vh;

  const bx = Math.max(0, Math.round(Number(bbox.x || 0) * scaleX));
  const by = Math.max(0, Math.round(Number(bbox.y || 0) * scaleY));
  const bwScaled = Math.round(Number(bbox.width || 0) * scaleX);
  const bhScaled = Math.round(Number(bbox.height || 0) * scaleY);

  return {
    x: bx,
    y: by,
    width: Math.min(bw - bx, Math.max(0, bwScaled)),
    height: Math.min(bh - by, Math.max(0, bhScaled))
  };
}

/**
 * Transforms a full page / document CSS bounding box into canonical bitmap pixel coordinates.
 * Subtracts scroll offsets and scales by bitmap dimensions.
 *
 * @param {{ x: number, y: number, width: number, height: number }} bbox
 * @param {object} context
 * @param {number} [context.scrollX=0]
 * @param {number} [context.scrollY=0]
 * @param {number} [context.viewportWidth=1280]
 * @param {number} [context.viewportHeight=800]
 * @param {number} [context.bitmapWidth]
 * @param {number} [context.bitmapHeight]
 * @param {number} [context.devicePixelRatio=1]
 * @returns {{ x: number, y: number, width: number, height: number, inViewport: boolean }}
 */
export function transformPageToBitmap(bbox, context = {}) {
  if (!bbox || typeof bbox !== "object") {
    return { x: 0, y: 0, width: 0, height: 0, inViewport: false };
  }
  const scrollX = Number(context.scrollX || 0);
  const scrollY = Number(context.scrollY || 0);

  const viewportBbox = {
    x: Number(bbox.x || 0) - scrollX,
    y: Number(bbox.y || 0) - scrollY,
    width: Number(bbox.width || 0),
    height: Number(bbox.height || 0)
  };

  const vw = Math.max(1, Number(context.viewportWidth) || 1280);
  const vh = Math.max(1, Number(context.viewportHeight) || 800);

  const inViewport = (
    viewportBbox.x + viewportBbox.width > 0 &&
    viewportBbox.x < vw &&
    viewportBbox.y + viewportBbox.height > 0 &&
    viewportBbox.y < vh
  );

  const bitmapBbox = transformViewportToBitmap(viewportBbox, context);
  return {
    ...bitmapBbox,
    inViewport
  };
}

/**
 * Transforms YOLO model detection coordinates (normalized 0-1, letterboxed, or model input pixels)
 * into canonical image bitmap coordinates.
 *
 * @param {{ x: number, y: number, width: number, height: number }} bbox
 * @param {object} context
 * @param {number} [context.modelWidth=640]
 * @param {number} [context.modelHeight=640]
 * @param {number} context.bitmapWidth
 * @param {number} context.bitmapHeight
 * @param {number} [context.padX=0] - Letterbox horizontal padding in model pixels
 * @param {number} [context.padY=0] - Letterbox vertical padding in model pixels
 * @param {number} [context.scale=1] - Letterbox scale ratio
 * @param {boolean} [context.isNormalized=false] - True if box is normalized [0, 1] relative to bitmap
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function transformYoloToBitmap(bbox, context = {}) {
  if (!bbox || typeof bbox !== "object") {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const bw = Math.max(1, Number(context.bitmapWidth) || 800);
  const bh = Math.max(1, Number(context.bitmapHeight) || 600);

  // If already normalized [0, 1]
  if (context.isNormalized || (bbox.x <= 1 && bbox.y <= 1 && bbox.width <= 1 && bbox.height <= 1 && (bbox.width > 0 || bbox.height > 0))) {
    return {
      x: Math.max(0, Math.round(Number(bbox.x || 0) * bw)),
      y: Math.max(0, Math.round(Number(bbox.y || 0) * bh)),
      width: Math.min(bw, Math.round(Number(bbox.width || 0) * bw)),
      height: Math.min(bh, Math.round(Number(bbox.height || 0) * bh))
    };
  }

  const mw = Math.max(1, Number(context.modelWidth) || 640);
  const mh = Math.max(1, Number(context.modelHeight) || 640);
  const scale = Number(context.scale) || Math.min(mw / bw, mh / bh);
  const padX = context.padX !== undefined ? Number(context.padX) : Math.max(0, (mw - bw * scale) / 2);
  const padY = context.padY !== undefined ? Number(context.padY) : Math.max(0, (mh - bh * scale) / 2);

  if (scale > 0 && (padX > 0 || padY > 0 || scale !== 1)) {
    // Un-pad and un-scale
    const unpadX = (Number(bbox.x || 0) - padX) / scale;
    const unpadY = (Number(bbox.y || 0) - padY) / scale;
    const unpadW = Number(bbox.width || 0) / scale;
    const unpadH = Number(bbox.height || 0) / scale;

    const bx = Math.max(0, Math.round(unpadX));
    const by = Math.max(0, Math.round(unpadY));
    return {
      x: bx,
      y: by,
      width: Math.min(bw - bx, Math.max(0, Math.round(unpadW))),
      height: Math.min(bh - by, Math.max(0, Math.round(unpadH)))
    };
  }

  // Direct scale mapping from model pixels to bitmap pixels
  const scaleX = bw / mw;
  const scaleY = bh / mh;
  const bx = Math.max(0, Math.round(Number(bbox.x || 0) * scaleX));
  const by = Math.max(0, Math.round(Number(bbox.y || 0) * scaleY));
  return {
    x: bx,
    y: by,
    width: Math.min(bw - bx, Math.max(0, Math.round(Number(bbox.width || 0) * scaleX))),
    height: Math.min(bh - by, Math.max(0, Math.round(Number(bbox.height || 0) * scaleY)))
  };
}

/**
 * Converts bitmap pixel coordinates back to viewport CSS coordinates.
 */
export function transformBitmapToViewport(bbox, context = {}) {
  if (!bbox || typeof bbox !== "object") {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const vw = Math.max(1, Number(context.viewportWidth) || 1280);
  const vh = Math.max(1, Number(context.viewportHeight) || 800);
  const dpr = Math.max(0.1, Number(context.devicePixelRatio) || 1);
  const bw = Math.max(1, Number(context.bitmapWidth) || Math.round(vw * dpr));
  const bh = Math.max(1, Number(context.bitmapHeight) || Math.round(vh * dpr));

  const scaleX = vw / bw;
  const scaleY = vh / bh;

  return {
    x: Math.max(0, Math.round(Number(bbox.x || 0) * scaleX)),
    y: Math.max(0, Math.round(Number(bbox.y || 0) * scaleY)),
    width: Math.round(Number(bbox.width || 0) * scaleX),
    height: Math.round(Number(bbox.height || 0) * scaleY)
  };
}
