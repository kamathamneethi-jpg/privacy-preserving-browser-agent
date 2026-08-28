import test from "node:test";
import assert from "node:assert/strict";
import {
  PiiCategory,
  findPiiMatches,
  processOcrResult,
  reconstructOcrFragments,
  analyzeDomElementSemantics,
  areBoundingBoxesOverlapping,
  fuseDetectedPiiItems,
  detectPiiMultiSignal,
  calculateMultiSignalConfidence,
  EVIDENCE_GROUPS,
  DETECTION_CONFIG,
  sanitizeLocalizedItems
} from "../packages/privacy-core/src/index.js";

// --- 1. Email Detection (Multi-signal) ---
test("Email detection integrates pattern match and DOM semantics", () => {
  const matches = findPiiMatches("Contact user@example.com for support.");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].category, PiiCategory.EMAIL);

  const sem = analyzeDomElementSemantics({ type: "email", name: "user_email" });
  assert.ok(sem);
  assert.equal(sem.category, PiiCategory.EMAIL);
});

// --- 2. Phone Detection (International Formats) ---
test("Phone detection supports international format patterns", () => {
  const text1 = "Call US office +1 (555) 234-5678 or India +91 98765 43210.";
  const matches = findPiiMatches(text1);
  assert.equal(matches.length, 2);
  assert.equal(matches[0].category, PiiCategory.PHONE);
  assert.equal(matches[1].category, PiiCategory.PHONE);
});

// --- 3. Password Field Semantic Detection ---
test("Password fields are detected primarily via DOM semantics without reading raw passwords", () => {
  const sem = analyzeDomElementSemantics({ type: "password", autocomplete: "current-password" });
  assert.ok(sem);
  assert.equal(sem.category, PiiCategory.PASSWORD_FIELD);
  // Ensure no password string value is recorded
  assert.equal(sem.rawValue, undefined);
});

// --- 4. Credit Card Checksum & Negative Rejection ---
test("Credit card detection passes valid Luhn cards and rejects invalid checksum candidates", () => {
  const validCard = "4111 1111 1111 1111";
  const invalidCard = "4111 1111 1111 1112";

  const validMatches = findPiiMatches(`Card: ${validCard}`);
  const invalidMatches = findPiiMatches(`Card: ${invalidCard}`);

  assert.equal(validMatches.length, 1);
  assert.equal(validMatches[0].category, PiiCategory.PAYMENT_CARD);
  assert.equal(invalidMatches.length, 0); // Rejects non-Luhn candidate
});

// --- 5. OTP Field Detection ---
test("OTP fields are detected via DOM semantics and verification indicators without exposing values", () => {
  const sem = analyzeDomElementSemantics({ autocomplete: "one-time-code", placeholder: "Enter 6-digit OTP" });
  assert.ok(sem);
  assert.equal(sem.category, PiiCategory.OTP);
});

// --- 6. Ambiguous Categories (Person Name & Address) Treated Conservatively ---
test("Person name and address have conservative confidence without DOM semantic backing", () => {
  const titleNameMatch = findPiiMatches("Dr. Evelyn Reed visited the facility.");
  assert.equal(titleNameMatch.length, 1);
  assert.equal(titleNameMatch[0].category, PiiCategory.PERSON_NAME);
  assert.ok(titleNameMatch[0].confidence <= 0.60); // Conservative score

  const semName = analyzeDomElementSemantics({ autocomplete: "given-name", ariaLabel: "First Name" });
  assert.ok(semName);
  assert.equal(semName.category, PiiCategory.PERSON_NAME);
});

// --- 7. Account Identifier Detection ---
test("Account identifier patterns and DOM semantics are detected", () => {
  const accountMatch = findPiiMatches("Ref ACC-987654321");
  assert.equal(accountMatch.length, 1);
  assert.equal(accountMatch[0].category, PiiCategory.ACCOUNT_IDENTIFIER);

  const semAccount = analyzeDomElementSemantics({ name: "account_number", placeholder: "Account ID" });
  assert.ok(semAccount);
  assert.equal(semAccount.category, PiiCategory.ACCOUNT_IDENTIFIER);
});

// --- 8. OCR Fragment Reconstruction ---
test("OCR fragment reconstruction recombines horizontally split text blocks on the same line", () => {
  const splitBlocks = [
    { text: "user", bbox: { x: 100, y: 50, width: 40, height: 20 }, confidence: 95 },
    { text: "@example.com", bbox: { x: 145, y: 50, width: 90, height: 20 }, confidence: 92 }
  ];

  const reconstructed = reconstructOcrFragments(splitBlocks);
  assert.equal(reconstructed.length, 1);
  assert.equal(reconstructed[0].text, "user@example.com");

  const ocrItems = processOcrResult(splitBlocks);
  assert.equal(ocrItems.length, 1);
  assert.equal(ocrItems[0].category, PiiCategory.EMAIL);
});

// --- 9. DOM + OCR + Semantic Metadata Fusion into ONE Entity ---
test("A single PII detected through DOM + OCR + semantic metadata fuses into ONE entity tagged source: fusion", () => {
  const bbox = { x: 100, y: 200, width: 250, height: 35 };

  const domItems = [
    {
      id: "PII_DOM_1",
      category: "email",
      confidence: 0.82,
      bbox,
      source: "dom",
      placeholder: "[EMAIL_REDACTED]"
    }
  ];

  const ocrBlocks = [
    { text: "Contact alex@domain.org", bbox: { x: 105, y: 202, width: 240, height: 32 }, confidence: 96 }
  ];

  const domElements = [
    { type: "email", autocomplete: "email", bbox: { x: 98, y: 198, width: 255, height: 38 } }
  ];

  const fused = detectPiiMultiSignal({ domItems, ocrBlocks, domElements });

  assert.equal(fused.length, 1); // Exactly 1 entity produced
  assert.equal(fused[0].category, "email");
  assert.equal(fused[0].source, "fusion"); // Tagged as fused
  assert.ok(fused[0].confidence > 0.85); // High confidence from multi-signal confirmation
});

// --- 10. Correlated Signal Capping ---
test("Correlated signals do not artificially push confidence to 0.99 or 1.0", () => {
  // Correlated signals: type="email", autocomplete="email", name="email" belong to DOM_SEMANTIC
  const score = calculateMultiSignalConfidence(PiiCategory.EMAIL, [
    EVIDENCE_GROUPS.PATTERN,
    EVIDENCE_GROUPS.DOM_SEMANTIC,
    EVIDENCE_GROUPS.OCR_VISUAL
  ]);

  assert.ok(score <= DETECTION_CONFIG.MAX_CONFIDENCE);
  assert.ok(score < 0.99);
});

// --- 11. Negative / False-Positive Tests ---
test("Negative tests: Non-PII text and generic strings are rejected or scored low", () => {
  const genericText = "Click here to read our public terms and condition documentation.";
  const matches = findPiiMatches(genericText);
  assert.equal(matches.length, 0);

  const semGeneric = analyzeDomElementSemantics({ type: "text", name: "search_query", placeholder: "Search website..." });
  assert.equal(semGeneric, null);
});

// --- 12. Strict Sanitization Guarantee ---
test("Multi-signal detection outputs strictly sanitized localized items without raw values", () => {
  const result = detectPiiMultiSignal({
    domItems: [
      {
        category: "email",
        confidence: 0.85,
        bbox: { x: 10, y: 10, width: 100, height: 20 },
        source: "dom",
        rawValue: "secret@example.com",
        text: "secret@example.com"
      }
    ]
  });

  const sanitized = sanitizeLocalizedItems(result);
  assert.equal(sanitized.length, 1);
  assert.equal(sanitized[0].rawValue, undefined);
  assert.equal(sanitized[0].text, undefined);
  assert.equal(JSON.stringify(sanitized).includes("secret@example.com"), false);
});
