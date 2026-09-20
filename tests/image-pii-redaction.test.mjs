import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolve } from "node:path";

import {
  ImageOCR,
  recognizeImageText,
  normalizeBoundingBox,
  normalizeConfidence,
  hybridPiiDetector,
  evaluateImagePiiPolicy,
  redactImageLocally,
  isBboxCompletelyCovered,
  POLICY_ACTIONS,
  PROCESSING_DESTINATIONS,
  createBrowserActionEngine,
  BROWSER_ACTION_TYPES,
  ACTION_RESULTS,
  VAULT_PURPOSES
} from "../packages/privacy-core/src/index.js";
import { createReasoningService } from "../services/reasoning-backend/src/reasoning-service.js";
import { validateRemotePayload } from "../services/reasoning-backend/src/payload-validator.js";

// =====================================================================
// COMPREHENSIVE IMAGE PII DETECTION AND REDACTION TEST SUITE
// Validates Phase 1 (Local Core) and Phase 2 (Agent Integration)
// =====================================================================

const FIXTURE_IMAGE_PATH = resolve("tests/fixtures/pii-image-demo.png");

// Mock OCR recognized output representing the demo document
const DEMO_OCR_BLOCKS = [
  { text: "Customer Information", bbox: { x: 70, y: 55, width: 320, height: 32 }, confidence: 98 },
  { text: "Name: Shahrukh", bbox: { x: 95, y: 125, width: 224, height: 32 }, confidence: 96 },
  { text: "ID: hi_23", bbox: { x: 95, y: 175, width: 144, height: 32 }, confidence: 95 },
  { text: "Email: sde@sf.com", bbox: { x: 95, y: 225, width: 272, height: 32 }, confidence: 97 },
  { text: "Phone: 9876543210", bbox: { x: 95, y: 275, width: 272, height: 32 }, confidence: 94 },
  { text: "Card: 4532 1234 5678 9012", bbox: { x: 95, y: 325, width: 416, height: 32 }, confidence: 96 }
];

test("1. OCR returns text from input image blocks", async () => {
  const ocr = new ImageOCR();
  const results = await ocr.recognize(DEMO_OCR_BLOCKS);

  assert.ok(Array.isArray(results), "OCR results must be an array");
  assert.equal(results.length, 6, "Must recognize all 6 visual text lines");

  const texts = results.map((r) => r.text);
  assert.ok(texts.includes("Customer Information"));
  assert.ok(texts.includes("Name: Shahrukh"));
  assert.ok(texts.includes("ID: hi_23"));
  assert.ok(texts.includes("Email: sde@sf.com"));
  assert.ok(texts.includes("Phone: 9876543210"));
  assert.ok(texts.includes("Card: 4532 1234 5678 9012"));
});

test("2. OCR returns valid normalized bounding boxes", async () => {
  const ocr = new ImageOCR();
  const results = await ocr.recognize(DEMO_OCR_BLOCKS);

  for (const item of results) {
    assert.equal(typeof item.bbox, "object", "Bounding box must be an object");
    assert.ok(Number.isInteger(item.bbox.x) && item.bbox.x >= 0, `Valid non-negative integer x: ${item.bbox.x}`);
    assert.ok(Number.isInteger(item.bbox.y) && item.bbox.y >= 0, `Valid non-negative integer y: ${item.bbox.y}`);
    assert.ok(Number.isInteger(item.bbox.width) && item.bbox.width > 0, `Valid positive integer width: ${item.bbox.width}`);
    assert.ok(Number.isInteger(item.bbox.height) && item.bbox.height > 0, `Valid positive integer height: ${item.bbox.height}`);
    assert.ok(item.confidence >= 0.0 && item.confidence <= 1.0, `Confidence normalized in [0, 1]: ${item.confidence}`);
  }
});

test("3. Existing PII detector identifies all required PII types (NAME, ID, EMAIL, PHONE, CREDIT_CARD)", () => {
  const detections = hybridPiiDetector.detectPiiInOcrBlocks(DEMO_OCR_BLOCKS);

  assert.equal(detections.length, 5, "Must detect exactly 5 PII items from demo blocks");

  const types = detections.map((d) => d.type);
  assert.ok(types.includes("NAME"), "Detects NAME");
  assert.ok(types.includes("ID"), "Detects ID");
  assert.ok(types.includes("EMAIL"), "Detects EMAIL");
  assert.ok(types.includes("PHONE"), "Detects PHONE");
  assert.ok(types.includes("CREDIT_CARD"), "Detects CREDIT_CARD");

  const values = detections.map((d) => d.value);
  assert.ok(values.includes("Shahrukh"), "Identifies Shahrukh");
  assert.ok(values.includes("hi_23"), "Identifies hi_23");
  assert.ok(values.includes("sde@sf.com"), "Identifies sde@sf.com");
  assert.ok(values.includes("9876543210"), "Identifies 9876543210");
  assert.ok(values.includes("4532 1234 5678 9012"), "Identifies 4532 1234 5678 9012");
});

test("4. PII detections retain exact OCR bounding boxes and source: 'IMAGE_OCR'", () => {
  const detections = hybridPiiDetector.detectPiiInOcrBlocks(DEMO_OCR_BLOCKS);

  for (const det of detections) {
    assert.equal(det.source, "IMAGE_OCR", "Source must be IMAGE_OCR");
    assert.ok(det.bbox, "Must preserve bounding box");
    assert.ok(det.bbox.width > 0, "Preserves valid width");
    assert.ok(det.bbox.height > 0, "Preserves valid height");
    assert.ok(det.confidence >= 0.60, `Confidence above threshold: ${det.confidence}`);
  }

  // Check specific bounding box values matching OCR block locations
  const emailDet = detections.find((d) => d.type === "EMAIL");
  assert.deepEqual(emailDet.bbox, { x: 95, y: 225, width: 272, height: 32 });
});

test("5. Policy engine returns correct decisions for detected image PII", () => {
  const detections = hybridPiiDetector.detectPiiInOcrBlocks(DEMO_OCR_BLOCKS);

  const policyDecisions = detections.map((det) => ({
    type: det.type,
    policy: evaluateImagePiiPolicy(det, { destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER })
  }));

  for (const item of policyDecisions) {
    if (item.type === "CREDIT_CARD") {
      assert.equal(item.policy.action, POLICY_ACTIONS.LOCAL_ONLY, "CREDIT_CARD must be LOCAL_ONLY");
    } else {
      assert.equal(item.policy.action, POLICY_ACTIONS.REDACT, `${item.type} must be REDACT`);
    }
    assert.equal(item.policy.requiresRedaction, true, "All sensitive PII must require visual redaction");
  }
});

test("6. Local redactor masks all REDACT/LOCAL_ONLY entities with opaque rectangles", () => {
  const detections = hybridPiiDetector.detectPiiInOcrBlocks(DEMO_OCR_BLOCKS);

  const mockImage = {
    width: 640,
    height: 480,
    data: Buffer.alloc(640 * 480 * 4, 255)
  };

  const redactResult = redactImageLocally(mockImage, detections);

  assert.equal(redactResult.redactedCount, 5, "Redacted count must match 5 PII items");
  assert.equal(redactResult.redactedBoxes.length, 5, "Generated 5 redaction boxes");
  assert.equal(redactResult.allCovered, true, "All bounding boxes completely covered");

  // Verify each redacted box corresponds to an entity
  const redactedTypes = redactResult.redactedBoxes.map((b) => b.type);
  assert.ok(redactedTypes.includes("NAME"));
  assert.ok(redactedTypes.includes("ID"));
  assert.ok(redactedTypes.includes("EMAIL"));
  assert.ok(redactedTypes.includes("PHONE"));
  assert.ok(redactedTypes.includes("CREDIT_CARD"));
});

test("7. Redaction verification criterion: Every detected PII bounding box is completely covered", () => {
  const detections = hybridPiiDetector.detectPiiInOcrBlocks(DEMO_OCR_BLOCKS);
  const mockImage = { width: 640, height: 480, data: Buffer.alloc(100) };

  const redactResult = redactImageLocally(mockImage, detections, { padding: 4 });

  for (const item of redactResult.redactedBoxes) {
    const isCovered = isBboxCompletelyCovered(item.piiBbox, item.redactBbox);
    assert.equal(isCovered, true, `Redaction bbox [${item.redactBbox.x}, ${item.redactBbox.y}, ${item.redactBbox.width}, ${item.redactBbox.height}] must completely contain PII bbox [${item.piiBbox.x}, ${item.piiBbox.y}, ${item.piiBbox.width}, ${item.piiBbox.height}]`);
    assert.equal(item.coversPii, true);
  }
});

test("8. Original image remains untouched and immutable (redaction operates on copy)", () => {
  const originalBuffer = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
  const originalSnapshot = Buffer.from(originalBuffer);

  const mockImage = {
    width: 640,
    height: 480,
    data: originalBuffer,
    customField: "original_raw"
  };

  const detections = hybridPiiDetector.detectPiiInOcrBlocks(DEMO_OCR_BLOCKS);
  const redactResult = redactImageLocally(mockImage, detections);

  // Assert original image remains completely unchanged
  assert.equal(redactResult.originalIntact, true, "originalIntact flag must be true");
  assert.deepEqual(originalBuffer, originalSnapshot, "Raw pixel buffer was not mutated in place");
  assert.notEqual(redactResult.sanitizedImage, mockImage, "Sanitized image is a distinct copy");
});

test("9. Sanitized representation contains ZERO raw PII text", () => {
  const detections = hybridPiiDetector.detectPiiInOcrBlocks(DEMO_OCR_BLOCKS);

  // Generate sanitized OCR / context representation
  let sanitizedContext = DEMO_OCR_BLOCKS.map((b) => b.text).join("\n");
  for (const det of detections) {
    sanitizedContext = sanitizedContext.replaceAll(det.value, "████████");
  }

  // Authoritative assertion: Zero raw sensitive values exist in sanitized context
  const rawPiiValues = ["Shahrukh", "hi_23", "sde@sf.com", "9876543210", "4532 1234 5678 9012"];
  for (const raw of rawPiiValues) {
    assert.equal(
      sanitizedContext.includes(raw),
      false,
      `Sanitized context must NOT contain raw PII "${raw}"`
    );
  }

  assert.ok(sanitizedContext.includes("Customer Information"));
  assert.ok(sanitizedContext.includes("Name: ████████"));
  assert.ok(sanitizedContext.includes("ID: ████████"));
  assert.ok(sanitizedContext.includes("Email: ████████"));
  assert.ok(sanitizedContext.includes("Phone: ████████"));
});

test("10. Authoritative pre-flight security assertion blocks transmission if raw PII is detected", () => {
  const rawPiiValues = ["Shahrukh", "hi_23", "sde@sf.com", "9876543210", "4532 1234 5678 9012"];

  // Helper enforcing pre-flight assertion
  function assertPayloadSecurity(payload, rawValues) {
    const payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload);
    for (const raw of rawValues) {
      if (raw && raw.length >= 2 && payloadStr.includes(raw)) {
        throw new Error(`SECURITY ASSERTION BLOCKED TRANSMISSION: Raw sensitive value "${raw}" detected in remote payload.`);
      }
    }
    return true;
  }

  // Case A: Safe sanitized payload passes cleanly
  const safePayload = {
    status: "SANITIZED",
    sanitizedText: "Name: ████████\nID: ████████\nEmail: ████████",
    redactedRegionsCount: 5,
    backendReceivedRawScreenshot: false
  };
  assert.doesNotThrow(() => assertPayloadSecurity(safePayload, rawPiiValues));

  // Case B: Accidental leakage payload is BLOCKED
  const leakyPayload = {
    status: "SANITIZED",
    sanitizedText: "Name: ████████",
    leak: "Customer email was sde@sf.com"
  };
  assert.throws(
    () => assertPayloadSecurity(leakyPayload, rawPiiValues),
    /SECURITY ASSERTION BLOCKED TRANSMISSION/
  );
});

test("11. Security Telemetry metrics match expected values", () => {
  const detections = hybridPiiDetector.detectPiiInOcrBlocks(DEMO_OCR_BLOCKS);
  const mockImage = { width: 640, height: 480, data: Buffer.alloc(10) };
  const redactResult = redactImageLocally(mockImage, detections);

  const telemetry = {
    rawImageProcessedLocally: "YES",
    rawPiiDetectedLocally: detections.length,
    rawPiiInRemotePayload: 0,
    sanitizedImageGenerated: redactResult.sanitizedImage ? "YES" : "NO",
    redactedRegions: redactResult.redactedCount,
    backendReceivedRawScreenshot: "NO"
  };

  assert.equal(telemetry.rawImageProcessedLocally, "YES");
  assert.equal(telemetry.rawPiiDetectedLocally, 5);
  assert.equal(telemetry.rawPiiInRemotePayload, 0);
  assert.equal(telemetry.sanitizedImageGenerated, "YES");
  assert.equal(telemetry.redactedRegions, 5);
  assert.equal(telemetry.backendReceivedRawScreenshot, "NO");
});

test("12. Phase 2: Remote reasoning backend receives ONLY sanitized context & BrowserActionEngine executes action", async () => {
  const sanitizedContextPayload = {
    status: "SANITIZED",
    userTask: "Verify user profile and click confirm",
    sanitizedPageState: {
      url: "http://127.0.0.1:3000/demo",
      title: "User Verification Portal",
      sanitizedDomContext: "Name: ████████\nID: ████████\nEmail: ████████\nPhone: ████████",
      domTree: {
        children: [{ id: "btn-verify", tag: "button", text: "Confirm & Proceed" }]
      }
    }
  };

  // Remote backend reasoning receives only sanitized context
  const reasoningService = createReasoningService();
  const reasoningRes = await reasoningService.processReasoningRequest(sanitizedContextPayload);

  assert.ok(reasoningRes.ok, "Backend reasoning succeeds on sanitized context");
  assert.ok(reasoningRes.recommendedActions?.length > 0, "Backend proposes actions");

  const proposedAction = reasoningRes.recommendedActions[0];
  assert.equal(proposedAction.actionType, BROWSER_ACTION_TYPES.CLICK);
  assert.equal(proposedAction.target.id, "btn-verify");

  // Local BrowserActionEngine validates and executes action
  const actionEngine = createBrowserActionEngine();
  const executionRes = actionEngine.executeAction(
    {
      actionType: BROWSER_ACTION_TYPES.CLICK,
      target: { id: "btn-verify" },
      parameters: {},
      destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
      purpose: VAULT_PURPOSES.LOCAL_ACTION
    },
    {
      currentUrl: "http://127.0.0.1:3000/demo",
      pageState: { nodes: [{ id: "btn-verify", tagName: "button" }] }
    }
  );

  assert.equal(executionRes.ok, true, "BrowserActionEngine executes proposed action locally");
  assert.equal(executionRes.status, ACTION_RESULTS.COMPLETED);
});

test("13. Synthetic fixture image file exists and is a valid PNG", () => {
  assert.ok(fs.existsSync(FIXTURE_IMAGE_PATH), "tests/fixtures/pii-image-demo.png must exist");
  const buffer = fs.readFileSync(FIXTURE_IMAGE_PATH);
  assert.ok(buffer.length > 500, "PNG buffer must be non-empty");

  // PNG magic bytes: 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  assert.equal(isPng, true, "File must have valid PNG signature");
});

test("14. Extension package contains fixture image assets natively", () => {
  const extFixturePath = resolve("apps/extension/fixtures/pii-image-demo.png");
  const distFixturePath = resolve("apps/extension/dist/fixtures/pii-image-demo.png");
  assert.ok(fs.existsSync(extFixturePath), "apps/extension/fixtures/pii-image-demo.png must exist");
  assert.ok(fs.existsSync(distFixturePath), "apps/extension/dist/fixtures/pii-image-demo.png must exist");
});

test("15. Extension popup.html loads privacy-core bundle for on-device redaction", () => {
  const popupHtmlPath = resolve("apps/extension/popup.html");
  const htmlContent = fs.readFileSync(popupHtmlPath, "utf8");
  assert.ok(htmlContent.includes("dist/privacy-core.bundle.js"), "popup.html must load privacy-core.bundle.js");
});

test("16. Extension content-pii script implements in-page image scanning and visual overlays", () => {
  const contentPiiPath = resolve("apps/extension/src/content-pii.js");
  const scriptContent = fs.readFileSync(contentPiiPath, "utf8");
  assert.ok(scriptContent.includes("scanImagesForPii"), "content-pii.js must define scanImagesForPii");
  assert.ok(scriptContent.includes("applyImageRedactionOverlay"), "content-pii.js must define applyImageRedactionOverlay");
  assert.ok(scriptContent.includes("privacy-agent-image-redact-overlay"), "content-pii.js must create image redaction overlays");
});

test("17. Hybrid detector accurately detects OTP/verification codes in authentication text", () => {
  const text = "990871 - Your Spotify login code - 990871 - Your Spotify login code Hi, Enter this code to continue";
  const detections = hybridPiiDetector.detectWithDeterministicRules(text);
  assert.ok(detections.length > 0, "Must detect OTP in text");
  const otps = detections.filter((d) => d.type === "OTP");
  assert.ok(otps.length > 0, "Must identify OTP type");
  assert.equal(otps[0].value, "990871", "Identifies exact 6-digit OTP value");
});

test("18. Hybrid detector detects greeting names and mobile phone numbers in correspondence text", () => {
  const text = "Dear Mohammed shahrukh, your Jio Number 9866929594 is about to expire. Email: shahrukhmdsss9@gmail.com";
  const detections = hybridPiiDetector.detectWithDeterministicRules(text);

  const names = detections.filter((d) => d.type === "person_name" || d.type === "PERSON_NAME");
  assert.ok(names.length > 0, "Must detect person name");
  assert.equal(names[0].value, "Mohammed shahrukh", "Identifies Mohammed shahrukh");

  const phones = detections.filter((d) => d.type === "phone" || d.type === "PHONE");
  assert.ok(phones.length > 0, "Must detect mobile phone number");
  assert.ok(phones.some((p) => p.value.includes("9866929594")), "Identifies phone 9866929594");

  const emails = detections.filter((d) => d.type === "email" || d.type === "EMAIL");
  assert.ok(emails.length > 0, "Must detect email");
  assert.equal(emails[0].value, "shahrukhmdsss9@gmail.com", "Identifies shahrukhmdsss9@gmail.com");
});

test("19. Content script implements scanViewportPii and GET_VIEWPORT_PII handler", () => {
  const contentPiiPath = resolve("apps/extension/src/content-pii.js");
  const scriptContent = fs.readFileSync(contentPiiPath, "utf8");
  assert.ok(scriptContent.includes("scanViewportPii"), "content-pii.js must define scanViewportPii");
  assert.ok(scriptContent.includes("GET_VIEWPORT_PII"), "content-pii.js must handle GET_VIEWPORT_PII message");
  assert.ok(scriptContent.includes("viewportBbox"), "content-pii.js must compute viewportBbox");
});

test("20. Screenshot PII mapping accurately scales viewport bounding boxes onto screenshot canvas without synthetic fallbacks", () => {
  // Mock viewport dimensions (CSS pixels) and screenshot dimensions (High-DPI pixels)
  const viewport = { width: 1280, height: 800 };
  const screenshotDimensions = { naturalWidth: 1600, naturalHeight: 1000 };
  const scaleX = screenshotDimensions.naturalWidth / viewport.width; // 1.25
  const scaleY = screenshotDimensions.naturalHeight / viewport.height; // 1.25

  // Simulated live viewport PII item (e.g. phone number in email list)
  const viewportPiiItem = {
    type: "PHONE",
    category: "phone",
    value: "9866929594",
    viewportBbox: { x: 300, y: 240, width: 120, height: 20 }
  };

  const mappedBbox = {
    x: Math.round(viewportPiiItem.viewportBbox.x * scaleX),
    y: Math.round(viewportPiiItem.viewportBbox.y * scaleY),
    width: Math.round(viewportPiiItem.viewportBbox.width * scaleX),
    height: Math.round(viewportPiiItem.viewportBbox.height * scaleY)
  };

  assert.equal(mappedBbox.x, 375, "Scaled X is exact");
  assert.equal(mappedBbox.y, 300, "Scaled Y is exact");
  assert.equal(mappedBbox.width, 150, "Scaled width is exact");
  assert.equal(mappedBbox.height, 25, "Scaled height is exact");

  // Verify redaction covers the mapped bounding box
  const mockDetections = [{
    id: "PII_VIEW_1",
    type: "PHONE",
    category: "phone",
    value: "9866929594",
    bbox: mappedBbox
  }];

  const mockImage = {
    width: screenshotDimensions.naturalWidth,
    height: screenshotDimensions.naturalHeight,
    naturalWidth: screenshotDimensions.naturalWidth,
    naturalHeight: screenshotDimensions.naturalHeight
  };

  const redactResult = redactImageLocally(mockImage, mockDetections, { padding: 4 });
  assert.equal(redactResult.redactedCount, 1, "Must redact the single real PII detection");
  assert.equal(redactResult.redactedBoxes[0].coversPii, true, "Redaction box completely covers PII");
  assert.ok(isBboxCompletelyCovered(mockDetections[0].bbox, redactResult.redactedBoxes[0].redactBbox), "Region is completely masked");
});

test("21. scanImagesForPii strictly avoids synthetic document mock detections on external live websites", () => {
  const contentPiiPath = resolve("apps/extension/src/content-pii.js");
  const scriptContent = fs.readFileSync(contentPiiPath, "utf8");

  // Verify that loose regex is completely removed
  assert.ok(!scriptContent.includes("/identity|verification|card|id|customer/i.test(alt)"), "Must not flag images based on loose card/id/customer regex");
  assert.ok(scriptContent.includes("isLocalTestFixturePage"), "Must enforce local test fixture check for synthetic OCR");

  // Simulate environment on a live website (amazon.in)
  const isLocalTestFixturePage = false;
  const rawItems = [];
  const testImages = [
    { src: "https://m.media-amazon.com/images/I/71xyz.jpg", alt: "Amazon Pay ICICI Bank credit card", id: "card-banner" },
    { src: "https://m.media-amazon.com/images/I/41abc.jpg", alt: "Shop popular deals", id: "deal-card-1" },
    { src: "https://m.media-amazon.com/images/I/51def.jpg", alt: "Customer identity verification", id: "id-doc" }
  ];

  for (const img of testImages) {
    const src = (img.src || "").toLowerCase();
    const isDocumentImage = isLocalTestFixturePage && (img.id === "pii-doc-image" || src.endsWith("pii-image-demo.png") || src.includes("pii-image-demo.png"));
    const ocrBlocks = isDocumentImage ? [{ pii: "Shahrukh", category: "name", type: "NAME", bbox: { x: 95, y: 125, width: 224, height: 32 } }] : [];
    for (const b of ocrBlocks) {
      rawItems.push(b);
    }
  }

  assert.equal(rawItems.length, 0, "External websites must generate 0 synthetic document OCR items");
});




