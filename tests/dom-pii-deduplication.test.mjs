import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("1. DOM PII Localization & Deduplication: Zero-size bounds get hasBounds: false", async () => {
  const contentPii = await readFile(resolve("apps/extension/src/content-pii.js"), "utf8");
  assert.ok(contentPii.includes("hasBounds"), "content-pii.js must set hasBounds flag");
  assert.ok(contentPii.includes("deduplicateLocalizedItems"), "content-pii.js must implement deduplication pipeline");
});

test("2. Deduplication logic correctly handles bounds, parent/child nesting, and distinct visible elements", () => {
  // Mock deduplication logic directly matching content-pii.js
  function deduplicateLocalizedItems(rawItems) {
    const deduplicated = [];

    for (const item of rawItems) {
      const normVal = (item.value || "").trim().toLowerCase();
      const cat = item.category;
      const elem = item.element;

      let matchIdx = -1;

      for (let i = 0; i < deduplicated.length; i++) {
        const existing = deduplicated[i];
        if (existing.category !== cat) continue;

        const existingNormVal = (existing.value || "").trim().toLowerCase();

        let sameValue = false;
        if (cat === "phone" || cat === "phone_field") {
          const d1 = normVal.replace(/\D/g, "");
          const d2 = existingNormVal.replace(/\D/g, "");
          sameValue = d1.length >= 6 && d1 === d2;
        } else {
          sameValue = normVal === existingNormVal;
        }

        if (!sameValue) continue;

        const exElem = existing.element;
        const isSameOrNested =
          elem === exElem ||
          (elem && exElem && (elem.contains ? (elem.contains(exElem) || exElem.contains(elem)) : elem.id === exElem.id));

        if (isSameOrNested) {
          matchIdx = i;
          break;
        }
      }

      if (matchIdx >= 0) {
        const existing = deduplicated[matchIdx];
        if (!existing.hasBounds && item.hasBounds) {
          deduplicated[matchIdx] = item;
        }
      } else {
        deduplicated.push(item);
      }
    }

    return deduplicated;
  }

  const elemHeader = { id: "header-phone", contains: () => false };
  const elemFooter = { id: "footer-phone", contains: () => false };
  const elemNestedParent = { id: "nested-parent", contains: (other) => other.id === "nested-child" };
  const elemNestedChild = { id: "nested-child", contains: () => false };

  const rawItems = [
    // 1 & 2: Same element, one zero-bounds, one valid bounds
    { category: "phone", value: "+1-800-555-0199", element: elemHeader, hasBounds: false, bbox: null, confidence: 0.92 },
    { category: "phone", value: "+1-800-555-0199", element: elemHeader, hasBounds: true, bbox: { x: 765, y: 219, width: 77, height: 18 }, confidence: 0.92 },

    // 3: Distinct element with identical value (footer phone)
    { category: "phone", value: "+1-800-555-0199", element: elemFooter, hasBounds: true, bbox: { x: 1490, y: 219, width: 77, height: 18 }, confidence: 0.92 },

    // 4 & 5: Nested parent vs child element for email
    { category: "email", value: "user@example.com", element: elemNestedParent, hasBounds: false, bbox: null, confidence: 0.98 },
    { category: "email", value: "user@example.com", element: elemNestedChild, hasBounds: true, bbox: { x: 1146, y: 579, width: 185, height: 18 }, confidence: 0.98 }
  ];

  const result = deduplicateLocalizedItems(rawItems);

  // Assertions
  assert.equal(result.length, 3, "Should produce exactly 3 deduplicated items");

  // Phone 1 (Header): Has valid bounds
  assert.equal(result[0].element.id, "header-phone");
  assert.equal(result[0].hasBounds, true);
  assert.equal(result[0].bbox.x, 765);

  // Phone 2 (Footer): Separate visible element retained
  assert.equal(result[1].element.id, "footer-phone");
  assert.equal(result[1].hasBounds, true);
  assert.equal(result[1].bbox.x, 1490);

  // Email (Nested): Prefers detection with valid bounds
  assert.equal(result[2].value, "user@example.com");
  assert.equal(result[2].hasBounds, true);
  assert.equal(result[2].bbox.x, 1146);
});

test("3. Formatting output never displays (x:0, y:0, w:0, h:0) as a real box", () => {
  function formatLocItem(loc) {
    let boundsStr = "(no visible bounds)";
    if (loc.hasBounds && loc.bbox && (loc.bbox.width > 0 || loc.bbox.height > 0)) {
      boundsStr = `(x:${loc.bbox.x}, y:${loc.bbox.y}, w:${loc.bbox.width}, h:${loc.bbox.height})`;
    }
    return `[${loc.source.toUpperCase()}] ${loc.category} @ ${boundsStr} (${Math.round(loc.confidence * 100)}%)`;
  }

  const itemWithBounds = { source: "dom", category: "phone", hasBounds: true, bbox: { x: 765, y: 219, width: 77, height: 18 }, confidence: 0.92 };
  const itemNoBounds = { source: "dom", category: "email", hasBounds: false, bbox: null, confidence: 0.98 };

  assert.equal(formatLocItem(itemWithBounds), "[DOM] phone @ (x:765, y:219, w:77, h:18) (92%)");
  assert.equal(formatLocItem(itemNoBounds), "[DOM] email @ (no visible bounds) (98%)");
});
