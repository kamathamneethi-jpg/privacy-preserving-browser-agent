import test from "node:test";
import assert from "node:assert/strict";

import {
  extractDomTextNodes,
  generateDomNodeId,
  GlinerAdapter,
  glinerAdapter,
  HybridPiiDetector,
  hybridPiiDetector,
  redactTextString,
  redactDomNodes,
  GLINER_CONFIG,
  GLINER_TARGET_LABELS,
  GLINER_TAXONOMY_MAP,
  PiiCategory,
  POLICY_ACTIONS
} from "../packages/privacy-core/src/index.js";

test("1. DOM Extractor extracts text nodes, input values, textareas, selects, and ARIA labels", () => {
  const mockDomTree = {
    tag: "div",
    id: "app-container",
    children: [
      {
        tag: "h1",
        text: "User Checkout Portal"
      },
      {
        tag: "script",
        text: "console.log('malicious script');"
      },
      {
        tag: "style",
        text: "body { color: red; }"
      },
      {
        tag: "form",
        id: "checkout-form",
        children: [
          {
            tag: "label",
            text: "Full Name"
          },
          {
            tag: "input",
            id: "customer_name",
            value: "Dr. Alexander Wright"
          },
          {
            tag: "input",
            id: "customer_email",
            value: "alex.wright@example.com"
          },
          {
            tag: "input",
            id: "customer_phone",
            value: "+1-555-234-5678"
          },
          {
            tag: "textarea",
            id: "shipping_address",
            value: "742 Evergreen Terrace, Springfield"
          },
          {
            tag: "select",
            id: "country_select",
            text: "United States"
          },
          {
            tag: "div",
            id: "custom_editor",
            contentEditable: true,
            text: "Special delivery instructions for Jane Doe."
          },
          {
            tag: "button",
            id: "pay_btn",
            ariaLabel: "Submit Payment for Alexander Wright"
          }
        ]
      }
    ]
  };

  const extracted = extractDomTextNodes(mockDomTree);
  assert.ok(Array.isArray(extracted));
  assert.ok(extracted.length >= 7, `Expected at least 7 nodes, got ${extracted.length}`);

  // Assert scripts and styles are rejected
  const hasScript = extracted.some((n) => n.text.includes("malicious script"));
  const hasStyle = extracted.some((n) => n.text.includes("color: red"));
  assert.strictEqual(hasScript, false, "Forbidden script tag must not be extracted");
  assert.strictEqual(hasStyle, false, "Forbidden style tag must not be extracted");

  // Assert input and textarea values are captured with element IDs
  const nameNode = extracted.find((n) => n.nodeId === "customer_name");
  assert.ok(nameNode, "Input node must be found by id");
  assert.strictEqual(nameNode.text, "Dr. Alexander Wright");
  assert.strictEqual(nameNode.source, "input");

  const addressNode = extracted.find((n) => n.nodeId === "shipping_address");
  assert.ok(addressNode, "Textarea node must be found by id");
  assert.strictEqual(addressNode.text, "742 Evergreen Terrace, Springfield");
  assert.strictEqual(addressNode.source, "textarea");
});

test("2. Hybrid PII Detector accurately detects deterministic patterns (Email, Phone, Card with Luhn, Account ID)", async () => {
  const detector = new HybridPiiDetector();
  const text = "Contact john.doe@cybersec.org or call 415-555-0199. Card: 4111 1111 1111 1111, Account: ACC-98765432";

  const detections = await detector.detectPiiInText(text);
  assert.ok(detections.length >= 4, `Expected at least 4 detections, got ${detections.length}`);

  const emailDet = detections.find((d) => d.type === PiiCategory.EMAIL);
  assert.ok(emailDet, "Email must be detected");
  assert.strictEqual(emailDet.value, "john.doe@cybersec.org");
  assert.strictEqual(emailDet.source, "regex");

  const phoneDet = detections.find((d) => d.type === PiiCategory.PHONE);
  assert.ok(phoneDet, "Phone must be detected");
  assert.strictEqual(phoneDet.value, "415-555-0199");

  const cardDet = detections.find((d) => d.type === PiiCategory.PAYMENT_CARD);
  assert.ok(cardDet, "Credit card with valid Luhn must be detected");
  assert.strictEqual(cardDet.value, "4111 1111 1111 1111");

  const accDet = detections.find((d) => d.type === PiiCategory.ACCOUNT_IDENTIFIER);
  assert.ok(accDet, "Account identifier must be detected");
  assert.strictEqual(accDet.value, "ACC-98765432");
});

test("3. Local GLiNER Adapter extracts semantic Named Entities (Person Name, Address, Organization)", async () => {
  const adapter = new GlinerAdapter();
  await adapter.initialize();

  // Test Person Name
  const nameEntities = await adapter.extractEntities("Account owned by Dr. Jonathan Smith.");
  assert.ok(nameEntities.length > 0, "Person entity should be detected");
  assert.strictEqual(nameEntities[0].label, "person");
  assert.strictEqual(nameEntities[0].text, "Jonathan Smith");
  assert.ok(nameEntities[0].confidence >= 0.50);

  // Test Address
  const addrEntities = await adapter.extractEntities("Deliver package to 123 Maple Street.");
  assert.ok(addrEntities.length > 0, "Address entity should be detected");
  assert.strictEqual(addrEntities[0].label, "address");
  assert.strictEqual(addrEntities[0].text, "123 Maple Street");

  // Test Organization
  const orgEntities = await adapter.extractEntities("Employed at Cyberdyne Systems Inc.");
  assert.ok(orgEntities.length > 0, "Organization entity should be detected");
  assert.strictEqual(orgEntities[0].label, "organization");
  assert.strictEqual(orgEntities[0].text, "Cyberdyne Systems Inc");
});

test("4. False positive rejection: Non-PII common text and corporate names are not misclassified as PERSON", async () => {
  const adapter = new GlinerAdapter();
  await adapter.initialize();

  // "Apple Inc" should be ORGANIZATION, not PERSON
  const orgResult = await adapter.extractEntities("Partnering with Apple Inc.");
  const personMisclass = orgResult.filter((e) => e.label === "person");
  assert.strictEqual(personMisclass.length, 0, "Apple Inc must not be classified as a Person");

  // Normal text "Fast reliable delivery" should not be ADDRESS
  const normalTextResult = await adapter.extractEntities("We offer fast reliable delivery worldwide.");
  const addrMisclass = normalTextResult.filter((e) => e.label === "address");
  assert.strictEqual(addrMisclass.length, 0, "Normal text must not be misclassified as Address");

  // Normal non-phone quantity numbers
  const detector = new HybridPiiDetector();
  const numResult = await detector.detectPiiInText("Total items in cart: 42 units.");
  const phoneMisclass = numResult.filter((d) => d.type === PiiCategory.PHONE);
  assert.strictEqual(phoneMisclass.length, 0, "Quantity number 42 must not be misclassified as Phone");
});

test("5. Taxonomy normalization maps GLiNER labels to project PII categories", async () => {
  const detector = new HybridPiiDetector();
  const text = "Package for Sarah Connor sent to 456 Oak Avenue.";
  const detections = await detector.detectPiiInText(text);

  const nameDet = detections.find((d) => d.value === "Sarah Connor");
  assert.ok(nameDet, "Sarah Connor must be detected");
  assert.strictEqual(nameDet.type, PiiCategory.PERSON_NAME, "GLiNER 'person' must map to PiiCategory.PERSON_NAME");

  const addrDet = detections.find((d) => d.value === "456 Oak Avenue");
  assert.ok(addrDet, "456 Oak Avenue must be detected");
  assert.strictEqual(addrDet.type, PiiCategory.ADDRESS, "GLiNER 'address' must map to PiiCategory.ADDRESS");
});

test("6. Overlapping span resolution: Merges regex and GLiNER detections without duplication", async () => {
  const detector = new HybridPiiDetector();
  const regexDets = [
    { type: PiiCategory.EMAIL, value: "jane@test.org", start: 8, end: 22, confidence: 0.98, source: "regex" }
  ];
  const glinerDets = [
    { type: PiiCategory.EMAIL, value: "jane@test.org", start: 8, end: 22, confidence: 0.90, source: "gliner" }
  ];

  const merged = detector.mergeDetections(regexDets, glinerDets);
  assert.strictEqual(merged.length, 1, "Duplicate exact spans must be merged into 1 detection");
  assert.strictEqual(merged[0].source, "hybrid", "Dual-detected span should have hybrid source");
  assert.strictEqual(merged[0].confidence, 0.98);
});

test("7. Configurable confidence thresholds (0.3 to 0.7) adjust detection sensitivity", async () => {
  const detector = new HybridPiiDetector();

  // Test at high threshold (0.75)
  detector.setConfidenceThreshold(0.75);
  assert.strictEqual(detector.confidenceThreshold, 0.75);

  // Test at low threshold (0.35)
  detector.setConfidenceThreshold(0.35);
  assert.strictEqual(detector.confidenceThreshold, 0.35);

  // Reset to default
  detector.setConfidenceThreshold(GLINER_CONFIG.DEFAULT_CONFIDENCE_THRESHOLD);
  assert.strictEqual(detector.confidenceThreshold, 0.50);
});

test("8. DOM Redactor applies ALLOW, REDACT, TOKENIZE, and LOCAL_ONLY policies", () => {
  const originalText = "User Alice Smith with email alice@mail.com and card 4532 0150 0000 0000";
  const detections = [
    { type: PiiCategory.PERSON_NAME, value: "Alice Smith", start: 5, end: 16 },
    { type: PiiCategory.EMAIL, value: "alice@mail.com", start: 28, end: 42 },
    { type: PiiCategory.PAYMENT_CARD, value: "4532 0150 0000 0000", start: 52, end: 71 }
  ];

  const policyRules = {
    [PiiCategory.PERSON_NAME]: POLICY_ACTIONS.ALLOW,
    [PiiCategory.EMAIL]: POLICY_ACTIONS.TOKENIZE,
    [PiiCategory.PAYMENT_CARD]: POLICY_ACTIONS.LOCAL_ONLY
  };

  const { sanitizedText, redactedCount, allowedCount, tokens } = redactTextString(originalText, detections, policyRules);

  // Alice Smith is ALLOW -> retained
  assert.ok(sanitizedText.includes("Alice Smith"), "Allowed entity must be retained");
  // alice@mail.com is TOKENIZE -> tokenized
  assert.ok(sanitizedText.includes("{{EMAIL_1}}"), "Tokenized entity must be replaced with token");
  assert.ok(!sanitizedText.includes("alice@mail.com"), "Raw email must not appear in sanitized text");
  // Card is LOCAL_ONLY -> protected marker
  assert.ok(sanitizedText.includes("[LOCAL_ONLY_PROTECTED]"), "Local only entity must be marked protected");
  assert.ok(!sanitizedText.includes("4532 0150 0000 0000"), "Raw credit card must not appear in sanitized text");

  assert.strictEqual(allowedCount, 1);
  assert.strictEqual(redactedCount, 2);
  assert.ok(tokens["{{EMAIL_1}}"]);
});

test("9. Full DOM Node Redaction preserves DOM structure, node IDs, and element paths", () => {
  const domNodes = [
    {
      nodeId: "node-header",
      elementPath: "body > div#header > h1",
      text: "Account Settings for Emily Davis",
      source: "text",
      bbox: { x: 10, y: 10, width: 200, height: 30 }
    },
    {
      nodeId: "input-email",
      elementPath: "body > form#profile > input#email",
      text: "emily.davis@corp.com",
      source: "input",
      bbox: { x: 10, y: 50, width: 180, height: 25 }
    }
  ];

  const detections = [
    { nodeId: "node-header", type: PiiCategory.PERSON_NAME, value: "Emily Davis", start: 21, end: 32 },
    { nodeId: "input-email", type: PiiCategory.EMAIL, value: "emily.davis@corp.com", start: 0, end: 20 }
  ];

  const policyRules = {
    [PiiCategory.PERSON_NAME]: POLICY_ACTIONS.REDACT,
    [PiiCategory.EMAIL]: POLICY_ACTIONS.REDACT
  };

  const { sanitizedNodes, summary } = redactDomNodes(domNodes, detections, policyRules);

  assert.strictEqual(sanitizedNodes.length, 2);
  assert.strictEqual(sanitizedNodes[0].nodeId, "node-header");
  assert.strictEqual(sanitizedNodes[0].elementPath, "body > div#header > h1");
  assert.strictEqual(sanitizedNodes[0].text, "Account Settings for [REDACTED]");

  assert.strictEqual(sanitizedNodes[1].nodeId, "input-email");
  assert.strictEqual(sanitizedNodes[1].elementPath, "body > form#profile > input#email");
  assert.strictEqual(sanitizedNodes[1].text, "[REDACTED]");

  assert.strictEqual(summary.redactedNodes, 2);
  assert.strictEqual(summary.totalRedactions, 2);
});

test("10. 100% Local Inference Guarantee: Hybrid detection initiates zero network calls", async () => {
  let networkCallAttempted = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    networkCallAttempted = true;
    throw new Error("Network prohibited during local PII inference");
  };

  try {
    const detector = new HybridPiiDetector();
    const domNodes = [
      { nodeId: "n1", text: "Contact Dr. Robert Taylor at robert.taylor@med.org", source: "text" },
      { nodeId: "n2", text: "Phone: +1 800 555 0199, Shipping: 888 Broadway, New York", source: "text" }
    ];

    const result = await detector.detectPiiInDomNodes(domNodes);
    assert.strictEqual(networkCallAttempted, false, "Local PII detection must NEVER make network calls");
    assert.ok(result.detections.length >= 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("11. Performance Benchmark: DOM extraction, regex, and GLiNER inference latency are recorded", async () => {
  const detector = new HybridPiiDetector({ debugMode: false });
  const sampleNodes = [];
  for (let i = 0; i < 25; i++) {
    sampleNodes.push({
      nodeId: `node_${i}`,
      elementPath: `body > div > p:nth-of-type(${i})`,
      text: `User Profile #${i}: Dr. John Doe, Email: user${i}@enterprise.com, Phone: 212-555-01${i < 10 ? "0" + i : i}, Address: ${100 + i} Main St.`,
      source: "text",
      bbox: { x: 10, y: i * 20, width: 300, height: 18 }
    });
  }

  const { detections, metrics, summary } = await detector.detectPiiInDomNodes(sampleNodes);
  assert.ok(detections.length >= 50, `Expected at least 50 detections, got ${detections.length}`);
  assert.ok(typeof metrics.regexMs === "number");
  assert.ok(typeof metrics.glinerMs === "number");
  assert.ok(typeof metrics.totalMs === "number");
  assert.ok(metrics.totalMs < 1000, `Expected 25 nodes sanitized in < 1000ms, took ${metrics.totalMs}ms`);
});

test("12. Fail-safe design: Model runtime errors fall back cleanly without throwing or exposing data", async () => {
  const faultyAdapter = new GlinerAdapter({
    sessionRunner: {
      run: () => {
        throw new Error("Simulated ONNX engine failure");
      }
    }
  });

  const detector = new HybridPiiDetector({ glinerAdapter: faultyAdapter });
  const text = "Important notice for user@secure.com";

  // Must not throw, should fall back to deterministic regex rules
  const detections = await detector.detectPiiInText(text);
  assert.ok(Array.isArray(detections));
  const emailDet = detections.find((d) => d.type === PiiCategory.EMAIL);
  assert.ok(emailDet, "Email must still be detected via deterministic fallback");
  assert.strictEqual(emailDet.value, "user@secure.com");
});
