/**
 * Local-only OCR perception runner for the Chrome Extension.
 * Extracts visual text bounding boxes and runs PII detection.
 */
(() => {
  const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const PHONE_PATTERN = /(?:\+?\d[\d(). -]{7,}\d)/g;
  const CARD_PATTERN = /(?:\d[ -]*?){13,19}/g;

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

  /**
   * Processes recognized OCR words or text blocks into localized PII items.
   *
   * @param {Array<{ text: string, bbox: { x: number, y: number, width: number, height: number }, confidence?: number }>} ocrBlocks
   * @returns {Array<object>} Localized OCR PII items without raw sensitive values
   */
  function processOcrBlocks(ocrBlocks) {
    if (!Array.isArray(ocrBlocks)) return [];
    const items = [];
    let counter = 0;

    for (const block of ocrBlocks) {
      if (!block || typeof block.text !== "string") continue;
      const text = block.text;

      const patterns = [
        { category: "email", pattern: EMAIL_PATTERN, baseConfidence: 0.98 },
        { category: "phone", pattern: PHONE_PATTERN, baseConfidence: 0.92 },
        { category: "payment_card", pattern: CARD_PATTERN, baseConfidence: 0.95, predicate: passesLuhn }
      ];

      for (const { category, pattern, baseConfidence, predicate } of patterns) {
        pattern.lastIndex = 0;
        for (const match of text.matchAll(pattern)) {
          if (!predicate || predicate(match[0])) {
            counter += 1;
            const blockConf = Number(block.confidence);
            const confidence = !isNaN(blockConf) && blockConf > 0
              ? Math.min(1.0, (blockConf / 100) * baseConfidence)
              : baseConfidence;

            items.push({
              id: `PII_OCR_${counter}`,
              category,
              confidence: Number(confidence.toFixed(2)),
              bbox: {
                x: Math.round(block.bbox?.x || 0),
                y: Math.round(block.bbox?.y || 0),
                width: Math.round(block.bbox?.width || 0),
                height: Math.round(block.bbox?.height || 0)
              },
              source: "ocr",
              placeholder: `[${category.toUpperCase()}_OCR_REDACTED]`
            });
          }
        }
      }
    }

    return items;
  }

  /**
   * Executes local OCR on image data.
   * Supports custom OCR engines or fallback text block extraction.
   *
   * @param {ImageData | HTMLCanvasElement | Array<object>} input
   * @returns {Promise<{ ok: boolean, items: Array<object>, count: number }>}
   */
  async function performLocalOcrScan(input) {
    let ocrBlocks = [];

    if (Array.isArray(input)) {
      ocrBlocks = input;
    } else if (typeof globalThis.Tesseract !== "undefined" && typeof globalThis.Tesseract.recognize === "function") {
      try {
        const result = await globalThis.Tesseract.recognize(input, "eng");
        if (result?.data?.words) {
          ocrBlocks = result.data.words.map((w) => ({
            text: w.text,
            confidence: w.confidence,
            bbox: {
              x: w.bbox.x0,
              y: w.bbox.y0,
              width: w.bbox.x1 - w.bbox.x0,
              height: w.bbox.y1 - w.bbox.y0
            }
          }));
        }
      } catch (err) {
        console.warn("Local Tesseract OCR processing deferred, falling back to block matcher:", err);
      }
    }

    const items = processOcrBlocks(ocrBlocks);
    return {
      ok: true,
      items,
      count: items.length
    };
  }

  if (typeof globalThis !== "undefined") {
    globalThis.OcrService = Object.freeze({
      processOcrBlocks,
      performLocalOcrScan
    });
  }
})();
