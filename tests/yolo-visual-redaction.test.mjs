import test from "node:test";
import assert from "node:assert/strict";

import {
  YoloDetector,
  yoloDetector,
  redactImageRegions,
  REDACTION_STYLES,
  YOLO_TARGET_CLASSES
} from "../packages/privacy-core/src/index.js";

test("1. YOLO Detector identifies visual sensitive regions (face, id_card, credit_card_box, signature, qr_code)", async () => {
  const detector = new YoloDetector();

  const mockImageInput = {
    width: 800,
    height: 600,
    elements: [
      { type: "face", bbox: { x: 50, y: 50, width: 80, height: 80 }, confidence: 0.92 },
      { type: "id_card", bbox: { x: 200, y: 150, width: 240, height: 160 }, confidence: 0.95 },
      { type: "credit_card_box", bbox: { x: 500, y: 300, width: 200, height: 120 }, confidence: 0.88 },
      { type: "signature", bbox: { x: 100, y: 400, width: 150, height: 60 }, confidence: 0.89 },
      { type: "qr_code", bbox: { x: 600, y: 50, width: 100, height: 100 }, confidence: 0.94 }
    ]
  };

  const detections = await detector.detectVisualPii(mockImageInput);
  assert.strictEqual(detections.length, 5);

  const faceDet = detections.find((d) => d.class === "face");
  assert.ok(faceDet);
  assert.strictEqual(faceDet.source, "yolo");
  assert.strictEqual(faceDet.bbox.width, 80);

  const idDet = detections.find((d) => d.class === "id_card");
  assert.ok(idDet);
  assert.strictEqual(idDet.bbox.x, 200);

  const qrDet = detections.find((d) => d.class === "qr_code");
  assert.ok(qrDet);
  assert.strictEqual(qrDet.bbox.width, 100);
});

test("2. Confidence threshold filtering excludes low-confidence visual detections", async () => {
  const detector = new YoloDetector({ confidenceThreshold: 0.70 });

  const mockImageInput = {
    elements: [
      { type: "face", bbox: { x: 10, y: 10, width: 50, height: 50 }, confidence: 0.85 },
      { type: "face", bbox: { x: 100, y: 100, width: 50, height: 50 }, confidence: 0.40 } // Below 0.70
    ]
  };

  const detections = await detector.detectVisualPii(mockImageInput);
  assert.strictEqual(detections.length, 1);
  assert.strictEqual(detections[0].confidence, 0.85);
});

test("3. Local Image Redaction applies solid masking to sensitive bounding boxes", () => {
  const fillsRecorded = [];
  const mockCanvasCtx = {
    fillStyle: "",
    fillRect: (x, y, w, h) => {
      fillsRecorded.push({ x, y, w, h, fillStyle: mockCanvasCtx.fillStyle });
    }
  };

  const visualDetections = [
    { class: "face", bbox: { x: 50, y: 50, width: 80, height: 80 } },
    { class: "id_card", bbox: { x: 200, y: 150, width: 240, height: 160 } }
  ];

  const result = redactImageRegions(mockCanvasCtx, visualDetections, { style: REDACTION_STYLES.SOLID_BLACK });

  assert.strictEqual(result.redactedBoxesCount, 2);
  assert.strictEqual(fillsRecorded.length, 2);
  assert.strictEqual(fillsRecorded[0].fillStyle, "#000000");
  assert.strictEqual(fillsRecorded[0].x, 50);
  assert.strictEqual(fillsRecorded[1].x, 200);
});

test("4. 100% Local Inference: Visual YOLO detection initiates zero network calls", async () => {
  let networkCallAttempted = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    networkCallAttempted = true;
    throw new Error("Network prohibited during local visual inference");
  };

  try {
    const detector = new YoloDetector();
    const mockImageInput = {
      elements: [{ type: "signature", bbox: { x: 0, y: 0, width: 100, height: 50 }, confidence: 0.90 }]
    };

    const detections = await detector.detectVisualPii(mockImageInput);
    assert.strictEqual(networkCallAttempted, false, "Local YOLO detection must NEVER make network calls");
    assert.strictEqual(detections.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
