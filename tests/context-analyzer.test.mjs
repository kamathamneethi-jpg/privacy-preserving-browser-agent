import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeTaskIntent,
  evaluatePiiTaskRelevance,
  TASK_INTENT_TYPES,
  TASK_RELEVANCE_LEVELS,
  CONTEXT_EVIDENCE_CODES,
  PiiCategory
} from "../packages/privacy-core/src/index.js";

// --- 1. Explicit Email Target ---
test("Task 'Find my email address' marks EMAIL as REQUIRED and PHONE as IRRELEVANT", () => {
  const piiItems = [
    { id: "PII_DOM_1", category: "email", confidence: 0.98 },
    { id: "PII_DOM_2", category: "phone", confidence: 0.92 }
  ];

  const result = evaluatePiiTaskRelevance({
    userInstruction: "Find my email address",
    piiItems
  });

  assert.equal(result.taskIntent, TASK_INTENT_TYPES.FIND_INFORMATION);
  assert.equal(result.piiRelevance.length, 2);

  const emailRel = result.piiRelevance.find((r) => r.category === PiiCategory.EMAIL);
  const phoneRel = result.piiRelevance.find((r) => r.category === PiiCategory.PHONE);

  assert.equal(emailRel.relevance, TASK_RELEVANCE_LEVELS.REQUIRED);
  assert.ok(emailRel.evidenceCodes.includes(CONTEXT_EVIDENCE_CODES.EXPLICIT_TASK_KEYWORD));
  assert.equal(emailRel.detectionConfidence, 0.98);
  assert.ok(emailRel.relevanceConfidence >= 0.90);

  assert.equal(phoneRel.relevance, TASK_RELEVANCE_LEVELS.IRRELEVANT);
});

// --- 2. Explicit Phone Target ---
test("Task 'Find my phone number' marks PHONE as REQUIRED", () => {
  const piiItems = [{ id: "PII_DOM_1", category: "phone", confidence: 0.92 }];
  const result = evaluatePiiTaskRelevance({
    userInstruction: "Find my phone number",
    piiItems
  });

  assert.equal(result.piiRelevance[0].relevance, TASK_RELEVANCE_LEVELS.REQUIRED);
});

// --- 3. Explicit OTP Target ---
test("Task 'Enter the OTP' marks OTP as REQUIRED", () => {
  const piiItems = [{ id: "PII_DOM_1", category: "otp", confidence: 0.85 }];
  const result = evaluatePiiTaskRelevance({
    userInstruction: "Enter the OTP",
    piiItems
  });

  assert.equal(result.piiRelevance[0].relevance, TASK_RELEVANCE_LEVELS.REQUIRED);
});

// --- 4. Multiple Explicit PII Categories ---
test("Task 'Enter my email and phone number' marks both EMAIL and PHONE as REQUIRED", () => {
  const piiItems = [
    { id: "PII_DOM_1", category: "email", confidence: 0.98 },
    { id: "PII_DOM_2", category: "phone", confidence: 0.92 }
  ];

  const result = evaluatePiiTaskRelevance({
    userInstruction: "Enter my email and phone number",
    piiItems
  });

  const emailRel = result.piiRelevance.find((r) => r.category === PiiCategory.EMAIL);
  const phoneRel = result.piiRelevance.find((r) => r.category === PiiCategory.PHONE);

  assert.equal(emailRel.relevance, TASK_RELEVANCE_LEVELS.REQUIRED);
  assert.equal(phoneRel.relevance, TASK_RELEVANCE_LEVELS.REQUIRED);
});

// --- 5. Task Negations ---
test("Task with negations 'Find my order number, do not send my email or phone' marks EMAIL and PHONE as IRRELEVANT with TASK_NEGATION evidence", () => {
  const piiItems = [
    { id: "PII_1", category: "account_identifier", confidence: 0.90 },
    { id: "PII_2", category: "email", confidence: 0.98 },
    { id: "PII_3", category: "phone", confidence: 0.92 }
  ];

  const result = evaluatePiiTaskRelevance({
    userInstruction: "Find my account number, do not send my email or phone",
    piiItems
  });

  const accountRel = result.piiRelevance.find((r) => r.category === PiiCategory.ACCOUNT_IDENTIFIER);
  const emailRel = result.piiRelevance.find((r) => r.category === PiiCategory.EMAIL);
  const phoneRel = result.piiRelevance.find((r) => r.category === PiiCategory.PHONE);

  assert.equal(accountRel.relevance, TASK_RELEVANCE_LEVELS.REQUIRED);

  assert.equal(emailRel.relevance, TASK_RELEVANCE_LEVELS.IRRELEVANT);
  assert.ok(emailRel.evidenceCodes.includes(CONTEXT_EVIDENCE_CODES.TASK_NEGATION));

  assert.equal(phoneRel.relevance, TASK_RELEVANCE_LEVELS.IRRELEVANT);
  assert.ok(phoneRel.evidenceCodes.includes(CONTEXT_EVIDENCE_CODES.TASK_NEGATION));
});

// --- 6. Ambiguous 'Contact Information' Task with DOM Metadata ---
test("Task 'Find my contact information' uses DOM semantic evidence to classify EMAIL as REQUIRED and PHONE as OPTIONAL", () => {
  const piiItems = [
    { id: "PII_1", category: "email", confidence: 0.98 },
    { id: "PII_2", category: "phone", confidence: 0.92 }
  ];

  const domSemantics = [{ category: "email", type: "email" }];

  const result = evaluatePiiTaskRelevance({
    userInstruction: "Find my contact information",
    piiItems,
    domSemantics
  });

  const emailRel = result.piiRelevance.find((r) => r.category === PiiCategory.EMAIL);
  const phoneRel = result.piiRelevance.find((r) => r.category === PiiCategory.PHONE);

  assert.equal(emailRel.relevance, TASK_RELEVANCE_LEVELS.REQUIRED);
  assert.ok(emailRel.evidenceCodes.includes(CONTEXT_EVIDENCE_CODES.DOM_SEMANTIC_MATCH));

  assert.equal(phoneRel.relevance, TASK_RELEVANCE_LEVELS.OPTIONAL);
});

// --- 7. Ambiguous Generic Form Task ---
test("Ambiguous task 'Complete this form' does NOT grant blanket REQUIRED status to all PII", () => {
  const piiItems = [
    { id: "PII_1", category: "email", confidence: 0.98 },
    { id: "PII_2", category: "phone", confidence: 0.92 },
    { id: "PII_3", category: "payment_card", confidence: 0.95 }
  ];

  const domSemantics = [{ category: "email", type: "email" }];

  const result = evaluatePiiTaskRelevance({
    userInstruction: "Complete this form",
    piiItems,
    domSemantics
  });

  const emailRel = result.piiRelevance.find((r) => r.category === PiiCategory.EMAIL);
  const cardRel = result.piiRelevance.find((r) => r.category === PiiCategory.PAYMENT_CARD);

  assert.notEqual(emailRel.relevance, TASK_RELEVANCE_LEVELS.REQUIRED);
  assert.equal(emailRel.relevance, TASK_RELEVANCE_LEVELS.OPTIONAL);

  assert.equal(cardRel.relevance, TASK_RELEVANCE_LEVELS.UNKNOWN);
});

// --- 8. Negative Non-PII Tasks ---
test("Read and Search tasks mark all detected PII as IRRELEVANT", () => {
  const piiItems = [
    { id: "PII_1", category: "email", confidence: 0.98 },
    { id: "PII_2", category: "phone", confidence: 0.92 }
  ];

  const readResult = evaluatePiiTaskRelevance({
    userInstruction: "Read the article on this page",
    piiItems
  });

  assert.equal(readResult.taskIntent, TASK_INTENT_TYPES.READ_INFORMATION);
  assert.equal(readResult.piiRelevance[0].relevance, TASK_RELEVANCE_LEVELS.IRRELEVANT);
  assert.equal(readResult.piiRelevance[1].relevance, TASK_RELEVANCE_LEVELS.IRRELEVANT);

  const searchResult = evaluatePiiTaskRelevance({
    userInstruction: "Search for laptops under $1000",
    piiItems
  });

  assert.equal(searchResult.taskIntent, TASK_INTENT_TYPES.SEARCH);
  assert.equal(searchResult.piiRelevance[0].relevance, TASK_RELEVANCE_LEVELS.IRRELEVANT);
});

// --- 9. Page Context & DOM Agreement for LOGIN ---
test("Login task uses DOM semantic evidence to classify PASSWORD as REQUIRED", () => {
  const piiItems = [{ id: "PII_PASS", category: "password_field", confidence: 0.95 }];
  const domSemantics = [{ category: "password_field", type: "password" }];

  const result = evaluatePiiTaskRelevance({
    userInstruction: "Login to my account",
    piiItems,
    domSemantics
  });

  assert.equal(result.taskIntent, TASK_INTENT_TYPES.LOGIN);
  const passRel = result.piiRelevance[0];
  assert.equal(passRel.relevance, TASK_RELEVANCE_LEVELS.REQUIRED);
  assert.ok(passRel.evidenceCodes.includes(CONTEXT_EVIDENCE_CODES.DOM_SEMANTIC_MATCH));
});

// --- 10. Separation of Confidence Scores ---
test("Detection confidence and relevance confidence remain separate properties", () => {
  const piiItems = [{ id: "PII_1", category: "email", confidence: 0.98 }];
  const result = evaluatePiiTaskRelevance({
    userInstruction: "Find my email address",
    piiItems
  });

  const rel = result.piiRelevance[0];
  assert.equal(rel.detectionConfidence, 0.98);
  assert.equal(rel.relevanceConfidence, 0.92);
  assert.notEqual(rel.detectionConfidence, rel.relevanceConfidence);
});

// --- 11. Zero Raw PII Exposure ---
test("Context Analyzer output contains zero raw PII strings", () => {
  const result = evaluatePiiTaskRelevance({
    userInstruction: "Find my email user@example.com",
    piiItems: [{ id: "PII_1", category: "email", confidence: 0.98 }]
  });

  const str = JSON.stringify(result);
  assert.equal(str.includes("user@example.com"), false);
});
