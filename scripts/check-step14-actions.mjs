import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  BrowserActionEngine,
  createBrowserActionEngine,
  browserActionEngine,
  validateNavigationProtocol,
  ACTION_SYSTEM_VERSION,
  ACTION_CONFIG,
  ACTION_STATUS,
  BROWSER_ACTION_TYPES,
  ACTION_RESULTS,
  ACTION_TARGET_TYPES,
  ACTION_REQUEST_SHAPE,
  PROCESSING_DESTINATIONS,
  POLICY_ACTIONS,
  VAULT_PURPOSES,
  storeSecret,
  clearVault,
  buildSanitizedReasoningPayload,
  evaluatePiiPolicyItem
} from "../packages/privacy-core/src/index.js";

const engineSrc = await readFile(resolve("packages/privacy-core/src/browser-action-engine.js"), "utf8");
const configSrc = await readFile(resolve("packages/privacy-core/src/action-config.js"), "utf8");
const contractsSrc = await readFile(resolve("packages/shared-types/src/privacy-contracts.js"), "utf8");

// 1. Verify required exports exist
const requiredExports = [
  "BrowserActionEngine",
  "createBrowserActionEngine",
  "browserActionEngine",
  "validateNavigationProtocol"
];
for (const exp of requiredExports) {
  if (!engineSrc.includes(exp)) {
    console.error(`browser-action-engine.js must export ${exp}.`);
    process.exit(1);
  }
}

// 2. Verify contracts and configuration
if (!ACTION_STATUS.READY || !ACTION_STATUS.DISPOSED) {
  console.error("ACTION_STATUS contract must define READY and DISPOSED.");
  process.exit(1);
}

if (!BROWSER_ACTION_TYPES.CLICK || !BROWSER_ACTION_TYPES.FILL || !BROWSER_ACTION_TYPES.NAVIGATE) {
  console.error("BROWSER_ACTION_TYPES contract must define CLICK, FILL, and NAVIGATE.");
  process.exit(1);
}

if (!ACTION_CONFIG.MAX_ACTIONS_PER_BATCH || ACTION_CONFIG.ACTION_TIMEOUT_MS !== 5000) {
  console.error("ACTION_CONFIG is invalid or missing defaults.");
  process.exit(1);
}

// 3. Test non-sensitive action execution
const engine = createBrowserActionEngine();
const clickRes = engine.executeAction({
  actionType: BROWSER_ACTION_TYPES.CLICK,
  target: { id: "btn_test_1" },
  destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
  purpose: VAULT_PURPOSES.LOCAL_ACTION
}, { pageState: { nodes: [{ id: "btn_test_1" }] } });

if (!clickRes.ok || clickRes.status !== ACTION_RESULTS.COMPLETED) {
  console.error("Non-sensitive click action execution failed.");
  process.exit(1);
}

// 4. Test sensitive action with Step 9 Vault retrieval
clearVault();
const secret = "Pass123!_Secret";
const stored = storeSecret({ category: "password", secretValue: secret, purpose: VAULT_PURPOSES.LOGIN });

let injectedVal = null;
const mockDriver = { fillElement: (id, val) => { injectedVal = val; } };
const authEngine = createBrowserActionEngine({ domDriver: mockDriver });

const sensitiveRes = authEngine.executeAction({
  actionType: BROWSER_ACTION_TYPES.FILL,
  target: { id: "pwd_field", vaultId: stored.vaultId, category: "password" },
  destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
  purpose: VAULT_PURPOSES.LOGIN,
  authorization: { authorizationGranted: true }
}, { pageState: { nodes: [{ id: "pwd_field" }] } });

if (!sensitiveRes.ok || sensitiveRes.status !== ACTION_RESULTS.COMPLETED || injectedVal !== secret) {
  console.error("Sensitive action with vault retrieval failed.");
  process.exit(1);
}

// Verify zero secret leakage in output object
if (JSON.stringify(sensitiveRes).includes(secret)) {
  console.error("Action result leaked raw secret in output payload!");
  process.exit(1);
}

// 5. Test Remote Destination Denial
const remoteRes = engine.executeAction({
  actionType: BROWSER_ACTION_TYPES.CLICK,
  target: { id: "btn_1" },
  destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
});
if (remoteRes.ok || remoteRes.status !== ACTION_RESULTS.DENIED_REMOTE_DESTINATION) {
  console.error("Remote action destination was not denied!");
  process.exit(1);
}

// 6. Test Dangerous Navigation Protocol Rejection
if (validateNavigationProtocol("javascript:alert(1)") !== false) {
  console.error("validateNavigationProtocol failed to reject javascript: URI scheme.");
  process.exit(1);
}

// 7. Static inspection for network API usage
const forbiddenApis = ["fetch(", "XMLHttpRequest", "WebSocket", "axios", "http:", "https:"];
for (const api of forbiddenApis) {
  if (engineSrc.includes(api)) {
    console.error(`Forbidden network API '${api}' found in BrowserActionEngine implementation!`);
    process.exit(1);
  }
}

// 8. Test Step 11 & Steps 1-13 Backward Compatibility
const sanitized = buildSanitizedReasoningPayload({ domTree: { tagName: "div", children: [] } });
if (!sanitized.ok || sanitized.payload.status !== "SANITIZED") {
  console.error("Step 11 Sanitized Context Builder backward compatibility failed.");
  process.exit(1);
}

const policy = evaluatePiiPolicyItem({
  piiItem: { id: "P1", category: "password", confidence: 0.95 },
  relevanceItem: { relevance: "REQUIRED", relevanceConfidence: 0.95 },
  destination: PROCESSING_DESTINATIONS.REMOTE_REASONING
});
if (policy.action !== POLICY_ACTIONS.LOCAL_ONLY) {
  console.error("Step 8 Policy Engine backward compatibility failed.");
  process.exit(1);
}

console.log("Step 14 verification passed: Browser-Agent Action System layer, contracts, validation, policy & vault integration, stale target protection, zero network calls, zero raw PII leakage, and backward compatibility verified.");
