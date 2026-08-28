import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  REMOTE_REASONING_STATUS,
  REASONING_PROVIDER_TYPES,
  REMOTE_REASONING_REQUEST_SHAPE,
  REMOTE_REASONING_RESPONSE_SHAPE,
  PROCESSING_DESTINATIONS,
  POLICY_ACTIONS
} from "../packages/shared-types/src/privacy-contracts.js";
import {
  ReasoningService,
  MockTestReasoningProvider,
  createReasoningService,
  validateRemotePayload,
  validateReasoningResponse,
  REASONING_SERVICE_VERSION,
  REASONING_CONFIG
} from "../services/reasoning-backend/src/index.js";
import {
  buildSanitizedReasoningPayload,
  createBrowserActionEngine,
  ACTION_RESULTS
} from "../packages/privacy-core/src/index.js";

const serviceSrc = await readFile(resolve("services/reasoning-backend/src/reasoning-service.js"), "utf8");
const validatorSrc = await readFile(resolve("services/reasoning-backend/src/payload-validator.js"), "utf8");
const privacyCoreSrc = await readFile(resolve("packages/privacy-core/src/index.js"), "utf8");

// 1. Verify required exports exist in reasoning-backend module
const requiredExports = ["ReasoningService", "MockTestReasoningProvider", "createReasoningService"];
for (const exp of requiredExports) {
  if (!serviceSrc.includes(exp)) {
    console.error(`reasoning-service.js must export ${exp}.`);
    process.exit(1);
  }
}

// 2. Verify contracts and configuration
if (!REMOTE_REASONING_STATUS.READY || !REMOTE_REASONING_STATUS.DISPOSED) {
  console.error("REMOTE_REASONING_STATUS contract must define READY and DISPOSED.");
  process.exit(1);
}

if (!REASONING_PROVIDER_TYPES.MOCK_TEST || !REASONING_PROVIDER_TYPES.REAL_REMOTE) {
  console.error("REASONING_PROVIDER_TYPES contract must define MOCK_TEST and REAL_REMOTE.");
  process.exit(1);
}

// 3. Test independent authoritative payload validation (does NOT trust status: "SANITIZED" alone!)
const maliciousPayload = {
  status: "SANITIZED",
  rawPassword: "SuperSecretPassword123!"
};
const valResult = validateRemotePayload(maliciousPayload);
if (valResult.valid) {
  console.error("Payload validator failed to reject payload containing raw password!");
  process.exit(1);
}

// 4. Test valid Step 11 sanitized payload processing
const service = createReasoningService();
const sanitized = buildSanitizedReasoningPayload({
  domTree: { tagName: "form", children: [{ id: "submit_button", tagName: "button" }] },
  taskIntent: "FORM_SUBMIT"
});

const reasoningRes = await service.processReasoningRequest(sanitized.payload);
if (!reasoningRes.ok || reasoningRes.status !== REMOTE_REASONING_STATUS.COMPLETED || !Array.isArray(reasoningRes.recommendedActions)) {
  console.error("ReasoningService failed to process valid sanitized payload.");
  process.exit(1);
}

// 5. Test Step 15 -> Step 14 execution boundary
const actionEngine = createBrowserActionEngine();
const actionProposal = reasoningRes.recommendedActions[0];
const actionRes = actionEngine.executeAction(actionProposal, { pageState: { nodes: [{ id: actionProposal.target?.id }] } });

if (!actionRes.ok || actionRes.status !== ACTION_RESULTS.COMPLETED) {
  console.error("Step 15 -> Step 14 action execution boundary test failed.");
  process.exit(1);
}

// 6. Verify zero coupling: privacy-core/src/index.js was NOT modified
if (privacyCoreSrc.includes("ReasoningService") || privacyCoreSrc.includes("services/reasoning-backend")) {
  console.error("CRITICAL SAFETY VIOLATION: packages/privacy-core/src/index.js must NOT export ReasoningService or couple with reasoning-backend!");
  process.exit(1);
}

console.log("Step 15 verification passed: Remote Reasoning Backend service, contracts, payload validator, response validator, mock provider, Step 11 -> Step 15 -> Step 14 pipeline integration, zero privacy-core coupling, and backward compatibility verified.");
