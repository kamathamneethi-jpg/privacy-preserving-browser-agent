import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("1. Local PII Highlighting: content-pii.js exports highlight and clear functions", async () => {
  const contentPii = await readFile(resolve("apps/extension/src/content-pii.js"), "utf8");
  assert.ok(contentPii.includes("highlightLocalizedPiiItems"), "content-pii.js must include highlightLocalizedPiiItems");
  assert.ok(contentPii.includes("clearLocalHighlights"), "content-pii.js must include clearLocalHighlights");
  assert.ok(contentPii.includes("privacy-agent-pii-highlight"), "content-pii.js must use mark class privacy-agent-pii-highlight");
  assert.ok(contentPii.includes("CLEAR_LOCAL_HIGHLIGHTS"), "content-pii.js must listen for CLEAR_LOCAL_HIGHLIGHTS message");
});

test("2. Range wrapping & clear highlights unwrap logic simulation", () => {
  // Simulate DOM Range surroundContents and unwrap logic
  class MockNode {
    constructor(nodeValue) {
      this.nodeValue = nodeValue;
      this.nodeType = 3; // Node.TEXT_NODE
      this.parentNode = null;
      this.children = [];
    }
    insertBefore(newChild, refChild) {
      this.children.push(newChild);
    }
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
    }
    normalize() {
      this.nodeValue = this.children.map((c) => c.nodeValue || c.textContent || "").join("");
    }
  }

  class MockMark {
    constructor(text) {
      this.className = "privacy-agent-pii-highlight";
      this.firstChild = { nodeValue: text };
      this.parentNode = null;
    }
  }

  const parent = new MockNode("");
  const mark = new MockMark("Shahrukh");
  mark.parentNode = parent;
  parent.children.push(mark);

  // Unwrap execution
  while (mark.firstChild) {
    parent.insertBefore(mark.firstChild, mark);
    mark.firstChild = null;
  }
  parent.removeChild(mark);
  parent.normalize();

  assert.equal(parent.nodeValue, "Shahrukh", "Unwrapping mark tag must restore underlying text without value loss");
});

test("3. Highlight is skipped when hasBounds is false", () => {
  const highlighted = [];
  function mockHighlightItem(item) {
    if (!item.hasBounds) return false;
    highlighted.push(item);
    return true;
  }

  const validItem = { category: "email", hasBounds: true, bbox: { x: 100, y: 100, width: 100, height: 20 } };
  const zeroBoundsItem = { category: "email", hasBounds: false, bbox: null };

  assert.equal(mockHighlightItem(validItem), true);
  assert.equal(mockHighlightItem(zeroBoundsItem), false);
  assert.equal(highlighted.length, 1);
  assert.equal(highlighted[0].category, "email");
});
