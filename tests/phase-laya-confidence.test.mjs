import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import {
  evaluatePiiPolicyItem,
  POLICY_ACTIONS,
  PROCESSING_DESTINATIONS,
  PiiCategory
} from "../packages/privacy-core/src/index.js";
import {
  LayaConfidenceClient,
  defaultLayaClient
} from "../packages/privacy-core/src/laya-confidence-client.js";
import { evaluatePolicyWithConfidence } from "../packages/privacy-core/src/policy-engine.js";

// =========================================================================
// 1. CLIENT CONTRACTS & FAIL-SAFE TESTS
// =========================================================================

test("1. LayaConfidenceClient initializes with local loopback and hardware-adaptive defaults", () => {
  const client = new LayaConfidenceClient();
  assert.equal(client.host, "127.0.0.1");
  assert.equal(client.port, 8766);
  assert.ok(client.timeoutMs >= 100);
  assert.ok(client.thetaStar >= 0.50 && client.thetaStar <= 0.95);
});

test("2. LayaConfidenceClient parses standard POST /score response cleanly", async () => {
  // Stand up ephemeral mock server
  const mockServer = http.createServer((req, res) => {
    if (req.url === "/score" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        choice: "LOCAL_ONLY",
        confidence: 0.942,
        per_option_probs: { ALLOW: 0.01, TOKENIZE: 0.02, REDACT: 0.028, LOCAL_ONLY: 0.942 },
        temperature_applied: 1.25,
        theta_star: 0.84,
        latency_ms: 32.5,
        mode: "finetuned"
      }));
    }
  });

  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;

  try {
    const client = new LayaConfidenceClient({ port });
    const score = await client.scoreField({ label: "Password", type: "password" });
    assert.ok(score);
    assert.equal(score.choice, "LOCAL_ONLY");
    assert.equal(score.confidence, 0.942);
    assert.equal(score.thetaStar, 0.84);
    assert.equal(score.temperatureApplied, 1.25);
    assert.equal(score.latencyMs, 32.5);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});

test("3. Timeout Fail-Safe: Slow or hanging service aborts cleanly without throwing", async () => {
  // Mock server that hangs
  const hangingServer = http.createServer((req, res) => {
    // Intentionally never respond
  });

  await new Promise((resolve) => hangingServer.listen(0, "127.0.0.1", resolve));
  const port = hangingServer.address().port;

  try {
    const client = new LayaConfidenceClient({ port, timeoutMs: 50 }); // Fast 50ms timeout
    const result = await client.scoreField({ label: "Slow Field" });
    assert.ok(result);
    assert.equal(result.choice, null);
    assert.equal(result.confidence, 0.0);
    assert.equal(result.error, "LAYA_SERVICE_TIMEOUT");
  } finally {
    await new Promise((resolve) => hangingServer.close(resolve));
  }
});

test("4. Offline Fail-Safe: Unreachable port returns null and error without unhandled rejection", async () => {
  const unusedPort = 59123;
  const client = new LayaConfidenceClient({ port: unusedPort, timeoutMs: 100 });
  const result = await client.scoreField({ label: "Offline Field" });
  assert.ok(result);
  assert.equal(result.choice, null);
  assert.equal(result.confidence, 0.0);
  assert.equal(result.error, "LAYA_SERVICE_UNAVAILABLE");
});

// =========================================================================
// 2. POLICY ENGINE ADDITIVE INTEGRATION TESTS
// =========================================================================

test("5. evaluatePolicyWithConfidence tags both rule_decision and laya_decision in telemetry", async () => {
  const mockServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      choice: "ALLOW",
      confidence: 0.91,
      theta_star: 0.85
    }));
  });

  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;

  try {
    const client = new LayaConfidenceClient({ port });
    const decision = await evaluatePolicyWithConfidence({
      piiItem: { id: "P_SEARCH", category: "product_title" },
      layaClient: client
    });

    assert.equal(decision.decision, POLICY_ACTIONS.ALLOW);
    assert.equal(decision.rule_decision, POLICY_ACTIONS.ALLOW);
    assert.equal(decision.laya_decision, "ALLOW");
    assert.equal(decision.laya_confidence, 0.91);
    assert.equal(decision.laya_disagreement, false);
    assert.equal(decision.review_suggested, false);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});

test("6. High-Confidence Disagreement (> theta*) flags review_suggested, but rule decision STILL WINS and executes", async () => {
  // Laya says REDACT with high confidence (0.92 >= 0.84), while Rule says ALLOW
  const mockServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      choice: "REDACT",
      confidence: 0.92,
      theta_star: 0.84
    }));
  });

  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;

  try {
    const client = new LayaConfidenceClient({ port, thetaStar: 0.84 });
    const decision = await evaluatePolicyWithConfidence({
      piiItem: { id: "P_QUERY", category: "product_title" },
      layaClient: client
    });

    // Authoritative Invariant: Rule engine decision STILL WINS and executes
    assert.equal(decision.decision, POLICY_ACTIONS.ALLOW);
    assert.equal(decision.action, POLICY_ACTIONS.ALLOW);
    assert.equal(decision.rule_decision, POLICY_ACTIONS.ALLOW);
    
    // Advisory Tagging: Flagged for review
    assert.equal(decision.laya_decision, "REDACT");
    assert.equal(decision.laya_disagreement, true);
    assert.equal(decision.review_suggested, true, "Disagreement with high confidence must flag review_suggested");
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});

test("7. Low-Confidence Disagreement (< theta*) does NOT flag review_suggested", async () => {
  // Laya says REDACT with low confidence (0.61 < 0.85)
  const mockServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      choice: "REDACT",
      confidence: 0.61,
      theta_star: 0.85
    }));
  });

  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;

  try {
    const client = new LayaConfidenceClient({ port, thetaStar: 0.85 });
    const decision = await evaluatePolicyWithConfidence({
      piiItem: { id: "P_QUERY", category: "product_title" },
      layaClient: client
    });

    assert.equal(decision.decision, POLICY_ACTIONS.ALLOW);
    assert.equal(decision.laya_disagreement, true);
    assert.equal(decision.review_suggested, false, "Low confidence disagreement must NOT trigger false review noise");
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});

test("8. Critical Secret Protection: Passwords and OTPs remain strictly LOCAL_ONLY regardless of Laya score", async () => {
  // Adversarial mock: Laya incorrectly claims password is ALLOW with 0.99 confidence
  const mockServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      choice: "ALLOW",
      confidence: 0.99,
      theta_star: 0.85
    }));
  });

  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;

  try {
    const client = new LayaConfidenceClient({ port });
    const decision = await evaluatePolicyWithConfidence({
      piiItem: { id: "P_PASS", category: PiiCategory.PASSWORD_FIELD, confidence: 0.99 },
      layaClient: client,
      destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
    });

    // CRITICAL SECURITY INVARIANT: ML suggestion can NEVER loosen protection on critical credentials
    assert.equal(decision.decision, POLICY_ACTIONS.LOCAL_ONLY);
    assert.equal(decision.action, POLICY_ACTIONS.LOCAL_ONLY);
    assert.equal(decision.placeholder, "[LOCAL_ONLY_PROTECTED]");
    assert.equal(decision.token, undefined);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});

test("9. Offline Fail-Safe Integration: evaluatePolicyWithConfidence executes rule engine alone when service is down", async () => {
  const offlineClient = new LayaConfidenceClient({ port: 59876, timeoutMs: 50 });
  const decision = await evaluatePolicyWithConfidence({
    piiItem: { id: "P_EMAIL", category: PiiCategory.EMAIL, confidence: 0.90 },
    layaClient: offlineClient
  });

  // Must execute rule engine decision seamlessly
  assert.equal(decision.decision, POLICY_ACTIONS.REDACT);
  assert.equal(decision.rule_decision, POLICY_ACTIONS.REDACT);
  assert.equal(decision.laya_decision, null);
  assert.equal(decision.laya_confidence, 0.0);
  assert.equal(decision.review_suggested, false);
  assert.equal(decision.laya_error, "LAYA_SERVICE_UNAVAILABLE");
});

test("10. Batched Scoring: scoreBatch parses multiple DOM items in single call", async () => {
  const mockServer = http.createServer((req, res) => {
    if (req.url === "/score-batch" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        results: [
          { choice: "ALLOW", confidence: 0.95 },
          { choice: "TOKENIZE", confidence: 0.88 }
        ],
        batch_size: 2,
        total_latency_ms: 45.2,
        avg_latency_per_field_ms: 22.6
      }));
    }
  });

  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;

  try {
    const client = new LayaConfidenceClient({ port });
    const batch = await client.scoreBatch([
      { state: { label: "Search" } },
      { state: { label: "Email" } }
    ]);

    assert.ok(batch);
    assert.equal(batch.batch_size, 2);
    assert.equal(batch.results.length, 2);
    assert.equal(batch.avg_latency_per_field_ms, 22.6);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});
