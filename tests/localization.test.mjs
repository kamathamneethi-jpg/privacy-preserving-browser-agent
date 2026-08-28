import test from "node:test";
import assert from "node:assert/strict";
import {
  findPiiMatches,
  processOcrResult,
  createLocalizedPiiItem,
  sanitizeLocalizedItems
} from "../packages/privacy-core/src/index.js";

test("findPiiMatches extracts match indices and confidence without raw text", () => {
  const text = "Contact dev@example.com or call +1 555-123-4567";
  const matches = findPiiMatches(text);

  assert.equal(matches.length, 2);
  const emailMatch = matches.find((m) => m.category === "email");
  const phoneMatch = matches.find((m) => m.category === "phone");

  assert.ok(emailMatch);
  assert.equal(emailMatch.confidence, 0.98);
  assert.equal(typeof emailMatch.index, "number");
  assert.equal(typeof emailMatch.length, "number");
  // Ensure no raw value key exists in match object
  assert.equal(emailMatch.rawValue, undefined);

  assert.ok(phoneMatch);
  assert.equal(phoneMatch.confidence, 0.92);
});

test("processOcrResult converts OCR blocks with bounding boxes into localized items", () => {
  const ocrBlocks = [
    {
      text: "User Email: user@domain.org",
      bbox: { x: 100, y: 200, width: 300, height: 40 },
      confidence: 95
    },
    {
      text: "Non sensitive headline",
      bbox: { x: 100, y: 50, width: 400, height: 50 },
      confidence: 99
    }
  ];

  const localizedItems = processOcrResult(ocrBlocks);
  assert.equal(localizedItems.length, 1);

  const item = localizedItems[0];
  assert.equal(item.category, "email");
  assert.equal(item.source, "ocr");
  assert.deepEqual(item.bbox, { x: 100, y: 200, width: 300, height: 40 });
  assert.ok(item.confidence > 0.9);
  assert.equal(item.placeholder, "[EMAIL_OCR_REDACTED]");
});

test("createLocalizedPiiItem normalizes bbox coordinates and enforces privacy placeholder", () => {
  const item = createLocalizedPiiItem({
    category: "PHONE",
    confidence: 0.945,
    bbox: { x: 12.8, y: 45.2, width: 100.4, height: 25.9 },
    source: "dom"
  });

  assert.equal(item.category, "phone");
  assert.equal(item.source, "dom");
  assert.deepEqual(item.bbox, { x: 13, y: 45, width: 100, height: 26 });
  assert.equal(item.confidence, 0.95); // Rounded
  assert.equal(item.placeholder, "[PHONE_REDACTED]");
});

test("sanitizeLocalizedItems strips accidental raw text fields", () => {
  const dirtyItems = [
    {
      category: "email",
      confidence: 0.98,
      bbox: { x: 10, y: 10, width: 50, height: 20 },
      source: "dom",
      rawValue: "secret@example.com",
      text: "secret@example.com"
    }
  ];

  const sanitized = sanitizeLocalizedItems(dirtyItems);
  assert.equal(sanitized.length, 1);
  assert.equal(sanitized[0].rawValue, undefined);
  assert.equal(sanitized[0].text, undefined);
  assert.equal(JSON.stringify(sanitized).includes("secret@example.com"), false);
});
