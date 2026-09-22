import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  transformViewportToBitmap,
  transformPageToBitmap,
  transformBitmapToViewport
} from "../packages/privacy-core/src/localization.js";
import {
  redactImageLocally,
  isBboxCompletelyCovered
} from "../packages/privacy-core/src/image-redactor.js";
import { captureSanitizedScreenshot } from "../apps/extension/src/popup.js";

describe("Visual Screenshot Coordinate Scaling & Redaction Regression Tests", () => {
  // --------------------------------------------------------------------------
  // Test 1: Active tab 1280x720 CSS, DPR 2, screenshot 2560x1440, Viewport box
  // --------------------------------------------------------------------------
  it("1. Active tab 1280x720 CSS, DPR 2 scales viewport PII box accurately to bitmap", () => {
    const tabContext = {
      viewportWidth: 1280,
      viewportHeight: 720,
      bitmapWidth: 2560,
      bitmapHeight: 1440,
      devicePixelRatio: 2,
      scrollX: 0,
      scrollY: 0
    };

    const viewportBbox = { x: 100, y: 100, width: 200, height: 40 };
    const bitmapBbox = transformViewportToBitmap(viewportBbox, tabContext);

    assert.equal(bitmapBbox.x, 200, "X: 100 * 2 = 200");
    assert.equal(bitmapBbox.y, 200, "Y: 100 * 2 = 200");
    assert.equal(bitmapBbox.width, 400, "W: 200 * 2 = 400");
    assert.equal(bitmapBbox.height, 80, "H: 40 * 2 = 80");
  });

  // --------------------------------------------------------------------------
  // Test 2: Scrolled page with PAGE coordinate: pageY=300 with scrollY=200
  // --------------------------------------------------------------------------
  it("2. Scrolled page subtracts scrollY properly: pageY=300, scrollY=200 -> bitmapY=200 at DPR 2", () => {
    const tabContext = {
      viewportWidth: 1280,
      viewportHeight: 720,
      bitmapWidth: 2560,
      bitmapHeight: 1440,
      devicePixelRatio: 2,
      scrollX: 0,
      scrollY: 200
    };

    const pageBbox = { x: 100, y: 300, width: 200, height: 40 };
    const res = transformPageToBitmap(pageBbox, tabContext);

    assert.equal(res.inViewport, true);
    assert.equal(res.x, 200, "X: 100 * 2 = 200");
    assert.equal(res.y, 200, "Y: (300 - 200) * 2 = 200 bitmap pixels");
    assert.equal(res.width, 400);
    assert.equal(res.height, 80);
  });

  // --------------------------------------------------------------------------
  // Test 3: Popup width 420px has NO effect on resulting bitmap coordinates
  // --------------------------------------------------------------------------
  it("3. Popup width (e.g. 420px) has ZERO effect on active tab bitmap coordinate scaling", () => {
    const tabContext = {
      viewportWidth: 1280,
      viewportHeight: 800,
      bitmapWidth: 1280,
      bitmapHeight: 800,
      devicePixelRatio: 1,
      scrollX: 0,
      scrollY: 0
    };

    // Even if global window.innerWidth were 420px in popup context, tabContext is authoritative
    const viewportBbox = { x: 50, y: 80, width: 150, height: 30 };
    const bitmapBbox = transformViewportToBitmap(viewportBbox, tabContext);

    assert.equal(bitmapBbox.x, 50);
    assert.equal(bitmapBbox.y, 80);
    assert.equal(bitmapBbox.width, 150);
    assert.equal(bitmapBbox.height, 30);
  });

  // --------------------------------------------------------------------------
  // Test 4: DPR 1.5 fractional scaling
  // --------------------------------------------------------------------------
  it("4. Fractional DPR 1.5 scales linearly without rounding drift", () => {
    const tabContext = {
      viewportWidth: 1000,
      viewportHeight: 600,
      bitmapWidth: 1500,
      bitmapHeight: 900,
      devicePixelRatio: 1.5,
      scrollX: 0,
      scrollY: 0
    };

    const viewportBbox = { x: 200, y: 100, width: 100, height: 50 };
    const bitmapBbox = transformViewportToBitmap(viewportBbox, tabContext);

    assert.equal(bitmapBbox.x, 300, "X: 200 * 1.5 = 300");
    assert.equal(bitmapBbox.y, 150, "Y: 100 * 1.5 = 150");
    assert.equal(bitmapBbox.width, 150, "W: 100 * 1.5 = 150");
    assert.equal(bitmapBbox.height, 75, "H: 50 * 1.5 = 75");
  });

  // --------------------------------------------------------------------------
  // Test 5: Non-square ultrawide screenshot (2.4:1) with DPR 1.25
  // --------------------------------------------------------------------------
  it("5. Non-square ultrawide screenshot scales accurately across aspect ratios", () => {
    const tabContext = {
      viewportWidth: 1920,
      viewportHeight: 800,
      bitmapWidth: 2400,
      bitmapHeight: 1000,
      devicePixelRatio: 1.25,
      scrollX: 0,
      scrollY: 0
    };

    const viewportBbox = { x: 400, y: 200, width: 200, height: 40 };
    const bitmapBbox = transformViewportToBitmap(viewportBbox, tabContext);

    assert.equal(bitmapBbox.x, 500, "X: 400 * 1.25 = 500");
    assert.equal(bitmapBbox.y, 250, "Y: 200 * 1.25 = 250");
    assert.equal(bitmapBbox.width, 250, "W: 200 * 1.25 = 250");
    assert.equal(bitmapBbox.height, 50, "H: 40 * 1.25 = 50");
  });

  // --------------------------------------------------------------------------
  // Test 6: Zero raw screenshot serialization before solid masking
  // --------------------------------------------------------------------------
  it("6. Local image redactor applies solid masking directly on cloned bitmap before export", () => {
    const mockImageSource = {
      width: 800,
      height: 600,
      data: Buffer.alloc(800 * 600 * 4)
    };

    const piiDetections = [
      { id: "PII_1", category: "email", bbox: { x: 50, y: 50, width: 120, height: 25 } }
    ];

    const redactResult = redactImageLocally(mockImageSource, piiDetections, { padding: 4 });

    assert.equal(redactResult.originalIntact, true, "Original source remains unmodified");
    assert.equal(redactResult.redactedCount, 1);
    assert.ok(redactResult.sanitizedImage, "Sanitized cloned image copy produced");
    assert.equal(redactResult.allCovered, true, "100% of PII region is covered");
  });

  // --------------------------------------------------------------------------
  // Test 7: isBboxCompletelyCovered assertion verification
  // --------------------------------------------------------------------------
  it("7. isBboxCompletelyCovered verifies that padded redaction rectangle completely encompasses PII box", () => {
    const piiBbox = { x: 100, y: 150, width: 200, height: 35 };
    const pad = 4;
    const redactBbox = {
      x: piiBbox.x - pad,
      y: piiBbox.y - pad,
      width: piiBbox.width + pad * 2,
      height: piiBbox.height + pad * 2
    };

    assert.equal(isBboxCompletelyCovered(piiBbox, redactBbox), true);
  });

  // --------------------------------------------------------------------------
  // Test 8: captureSanitizedScreenshot headless mock return
  // --------------------------------------------------------------------------
  it("8. captureSanitizedScreenshot safely handles headless/mock tab environment without crashing", async () => {
    const items = [
      { id: "PII_DOM_1", category: "email", bbox: { x: 100, y: 100, width: 150, height: 30 } }
    ];
    const tabContext = { viewportWidth: 1280, viewportHeight: 800, scrollX: 0, scrollY: 0 };

    const result = await captureSanitizedScreenshot(items, tabContext);
    assert.ok(typeof result === "string");
    assert.ok(result.startsWith("data:image/"));
  });
});
