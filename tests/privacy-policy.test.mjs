import test from "node:test";
import assert from "node:assert/strict";
import { PrivacyDecision, decidePrivacyPolicy, scanTextForPii, summarizeSensitiveCategories } from "../packages/privacy-core/src/index.js";

test("unknown information is redacted by default", () => {
  const result = decidePrivacyPolicy({ classification: "unknown", purpose: "remote_reasoning" });
  assert.equal(result.decision, PrivacyDecision.REDACT);
  assert.equal(result.mayLeaveDevice, false);
});

test("a user-authorized local action keeps sensitive data local", () => {
  const result = decidePrivacyPolicy({
    classification: "sensitive",
    purpose: "local_action",
    userAuthorized: true
  });
  assert.equal(result.decision, PrivacyDecision.LOCAL_ONLY);
  assert.equal(result.mayLeaveDevice, false);
});

test("remote reasoning can receive a token but not a sensitive value", () => {
  const result = decidePrivacyPolicy({
    classification: "sensitive",
    purpose: "remote_reasoning",
    requiresReference: true
  });
  assert.equal(result.decision, PrivacyDecision.TOKENIZE);
  assert.equal(result.mayLeaveDevice, true);
});

test("sensitive data without authorization or token need is redacted", () => {
  const result = decidePrivacyPolicy({ classification: "sensitive", purpose: "local_action" });
  assert.equal(result.decision, PrivacyDecision.REDACT);
});

test("explicitly non-sensitive information may be allowed", () => {
  const result = decidePrivacyPolicy({ classification: "not_sensitive", purpose: "render" });
  assert.equal(result.decision, PrivacyDecision.ALLOW);
  assert.equal(result.mayLeaveDevice, true);
});

test("text scanning returns counts without exposing detected email values", () => {
  const counts = scanTextForPii("Contact priya@example.com or call +91 98765 43210.");
  assert.deepEqual(counts, { email: 1, phone: 1, payment_card: 0 });
  assert.equal(JSON.stringify(counts).includes("priya@example.com"), false);
});

test("card-number candidates require a valid checksum", () => {
  const counts = scanTextForPii("Valid 4111 1111 1111 1111. Invalid 4111 1111 1111 1112.");
  assert.equal(counts.payment_card, 1);
});

test("all detected categories are redacted for remote reasoning by default", () => {
  const categories = summarizeSensitiveCategories({ email: 1, phone: 0, payment_card: 1 });
  assert.deepEqual(categories, [
    { category: "email", count: 1, decision: PrivacyDecision.REDACT },
    { category: "payment_card", count: 1, decision: PrivacyDecision.REDACT }
  ]);
});
