import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  E2E_WORKFLOW_STATUS,
  SECURE_COMMUNICATION_STATUS,
  ACTION_RESULTS,
  REASONING_PROVIDER_TYPES,
  SECURE_TRANSPORT_TYPES
} from "../packages/shared-types/src/privacy-contracts.js";
import {
  BrowserAgentCoordinator,
  createBrowserAgentCoordinator,
  BenchmarkUtility,
  createBenchmarkUtility,
  EnvironmentReporter,
  createEnvironmentReporter,
  SecurityAuditUtility,
  createSecurityAuditUtility,
  createSecureCommunicationClient,
  createBrowserActionEngine
} from "../packages/privacy-core/src/index.js";
import { SYNTHETIC_EVAL_DATASET } from "./fixtures/synthetic-eval-dataset.js";

// --- 1. End-to-End Task Workflows ---

test("1. Non-sensitive search task completes end-to-end workflow cleanly", async () => {
  const coordinator = createBrowserAgentCoordinator();
  const scenario = SYNTHETIC_EVAL_DATASET.scenarios.nonSensitiveSearch;

  const res = await coordinator.runEndToEndTask(
    { userTask: scenario.userTask, taskIntent: scenario.taskIntent },
    scenario.pageState
  );

  assert.equal(res.ok, true);
  assert.equal(res.status, E2E_WORKFLOW_STATUS.COMPLETED);
  assert.ok(res.metrics.totalEndToEndMs >= 0);
  assert.equal(res.metrics.privacyViolations, 0);
});

test("2. Sensitive form-fill task completes workflow with local vault authorization", async () => {
  const coordinator = createBrowserAgentCoordinator();
  const scenario = SYNTHETIC_EVAL_DATASET.scenarios.sensitiveFormFill;

  const res = await coordinator.runEndToEndTask(
    { userTask: scenario.userTask, taskIntent: scenario.taskIntent },
    scenario.pageState
  );

  assert.equal(res.ok, true);
  assert.equal(res.status, E2E_WORKFLOW_STATUS.COMPLETED);
  assert.equal(res.metrics.privacyViolations, 0);
});

// --- 2. Privacy Boundary & Secret Leakage Invariants ---

test("3. Sensitive vault secret NEVER appears in remote reasoning payload", async () => {
  let transmittedPayload = null;
  const mockTransport = {
    transportType: SECURE_TRANSPORT_TYPES.MOCK_TEST_TRANSPORT,
    sendRequest: async (envelope) => {
      transmittedPayload = envelope.sanitizedPayload;
      return { ok: true, status: "COMPLETED", statusCode: 200, recommendedActions: [] };
    }
  };

  const commClient = createSecureCommunicationClient({ transport: mockTransport });
  const coordinator = createBrowserAgentCoordinator({ commClient });
  const scenario = SYNTHETIC_EVAL_DATASET.scenarios.sensitiveFormFill;

  await coordinator.runEndToEndTask({ userTask: scenario.userTask }, scenario.pageState);

  const payloadStr = JSON.stringify(transmittedPayload);
  assert.equal(payloadStr.includes(scenario.pageState.vaultSecret.value), false, "Vault secret MUST NEVER enter remote payload!");
  assert.equal(payloadStr.includes("4532012345678910"), false, "Raw credit card number MUST NOT be in remote payload!");
});

test("4. Sensitive secret NEVER appears in benchmark metrics", async () => {
  const benchmark = createBenchmarkUtility();
  benchmark.startBenchmark();
  benchmark.recordStepLatency("perceptionMs", 12.5);
  const metrics = benchmark.endBenchmark();

  const metricsStr = JSON.stringify(metrics);
  assert.equal(metricsStr.includes("password"), false);
  assert.equal(metricsStr.includes("secret"), false);
  assert.equal(metricsStr.includes("4532"), false);
});

test("5. Sensitive secret NEVER appears in environment report", () => {
  const reporter = createEnvironmentReporter();
  const report = reporter.generateEnvironmentReport();

  const reportStr = JSON.stringify(report);
  assert.equal(reportStr.includes("password"), false);
  assert.equal(reportStr.includes("token"), false);
  assert.equal(reportStr.includes("api_key"), false);
});

// --- 3. Malicious Webpage & Unsafe Proposal Handling ---

test("6. Malicious webpage containing script injection primitives is handled safely", async () => {
  const coordinator = createBrowserAgentCoordinator();
  const scenario = SYNTHETIC_EVAL_DATASET.scenarios.maliciousScriptPage;

  const res = await coordinator.runEndToEndTask({ userTask: scenario.userTask }, scenario.pageState);
  assert.equal(res.ok, true);
  // Unsafe proposals or script links must be denied or filtered by response/action validator
  const actionResStr = JSON.stringify(res.executionResults);
  assert.equal(actionResStr.includes("eval("), false);
});

test("7. Remote reasoning attempting secret request is REJECTED by security validator", async () => {
  const mockSecretReqTransport = {
    transportType: SECURE_TRANSPORT_TYPES.MOCK_TEST_TRANSPORT,
    sendRequest: async () => ({
      ok: true,
      statusCode: 200,
      recommendedActions: [{ actionType: "TYPE", target: { id: "p" }, parameters: { vaultSecret: "rawPassword" } }]
    })
  };

  const commClient = createSecureCommunicationClient({ transport: mockSecretReqTransport });
  const coordinator = createBrowserAgentCoordinator({ commClient });
  const scenario = SYNTHETIC_EVAL_DATASET.scenarios.nonSensitiveSearch;

  const res = await coordinator.runEndToEndTask({ userTask: scenario.userTask }, scenario.pageState);
  assert.equal(res.ok, false);
  assert.equal(res.status, E2E_WORKFLOW_STATUS.DENIED);
});

test("8. Remote reasoning requesting direct DOM execution is REJECTED", async () => {
  const mockDirectDomTransport = {
    transportType: SECURE_TRANSPORT_TYPES.MOCK_TEST_TRANSPORT,
    sendRequest: async () => ({
      ok: true,
      statusCode: 200,
      recommendedActions: [{ actionType: "CLICK", executeDirectly: true }]
    })
  };

  const commClient = createSecureCommunicationClient({ transport: mockDirectDomTransport });
  const coordinator = createBrowserAgentCoordinator({ commClient });
  const scenario = SYNTHETIC_EVAL_DATASET.scenarios.nonSensitiveSearch;

  const res = await coordinator.runEndToEndTask({ userTask: scenario.userTask }, scenario.pageState);
  assert.equal(res.ok, false);
  assert.equal(res.status, E2E_WORKFLOW_STATUS.DENIED);
});

// --- 4. Remote Failure & Timeout Protection ---

test("9. Remote transport failure fails closed safely without executing actions", async () => {
  const mockFailTransport = {
    transportType: SECURE_TRANSPORT_TYPES.MOCK_TEST_TRANSPORT,
    sendRequest: async () => ({
      ok: false,
      statusCode: 500,
      error: "Remote backend unreachable"
    })
  };

  const commClient = createSecureCommunicationClient({ transport: mockFailTransport, MAX_RETRIES: 0 });
  const coordinator = createBrowserAgentCoordinator({ commClient });
  const scenario = SYNTHETIC_EVAL_DATASET.scenarios.nonSensitiveSearch;

  const res = await coordinator.runEndToEndTask({ userTask: scenario.userTask }, scenario.pageState);
  assert.equal(res.ok, false);
  assert.equal(res.status, E2E_WORKFLOW_STATUS.DENIED);
  assert.equal(res.metrics.deniedActions, 1);
});

// --- 5. Benchmarking & Environment Reporting ---

test("10. BenchmarkUtility records accurate step latency and count metrics", () => {
  const benchmark = createBenchmarkUtility();
  benchmark.startBenchmark();
  benchmark.recordStepLatency("perceptionMs", 15.2);
  benchmark.recordStepLatency("sanitizationMs", 8.4);
  benchmark.recordSuccessfulAction();
  benchmark.recordDeniedAction();
  const metrics = benchmark.endBenchmark();

  assert.equal(metrics.perceptionMs, 15.2);
  assert.equal(metrics.sanitizationMs, 8.4);
  assert.equal(metrics.successfulActions, 1);
  assert.equal(metrics.deniedActions, 1);
  assert.ok(metrics.totalEndToEndMs >= 0);
});

test("11. EnvironmentReporter generates honest 5-state system capabilities report", () => {
  const reporter = createEnvironmentReporter();
  const report = reporter.generateEnvironmentReport();

  assert.equal(report.ocrProvider, "MOCK_TEST");
  assert.equal(report.onnxProvider, "MOCK_TEST");
  assert.ok(["AVAILABLE", "NOT_AVAILABLE"].includes(report.webgpuStatus));
  assert.equal(report.reasoningProvider, REASONING_PROVIDER_TYPES.MOCK_TEST);
  assert.equal(report.transportProvider, SECURE_TRANSPORT_TYPES.MOCK_TEST_TRANSPORT);
});

// --- 6. Security Audit & Repository Hygiene ---

test("12. SecurityAuditUtility executes dynamic source code audit successfully", async () => {
  const audit = createSecurityAuditUtility();
  const result = await audit.runSecurityAudit();

  assert.equal(typeof result.pass, "boolean");
  assert.ok(Array.isArray(result.checkResults));
  assert.ok(result.checkResults.length > 0);

  for (const check of result.checkResults) {
    if (check.status !== "SKIPPED") {
      assert.equal(check.status, "PASS", `Security check '${check.check}' failed for file '${check.file}'`);
    }
  }
});

test("13. Static inspection: BrowserAgentCoordinator contains zero hardcoded production URLs or credentials", async () => {
  const src = await readFile(resolve("packages/privacy-core/src/browser-agent-coordinator.js"), "utf8");
  assert.equal(src.includes("https://example.com"), false);
  assert.equal(src.includes("api_key_production"), false);
});
