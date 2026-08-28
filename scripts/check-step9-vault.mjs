import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createLocalPrivacyVault,
  privacyVault,
  storeSecret,
  retrieveSecret,
  hasSecret,
  getVaultMetadata,
  listVaultMetadata,
  revokeSecret,
  expireSecret,
  clearVault,
  cleanupExpiredEntries,
  VAULT_VERSION,
  VAULT_CONFIG,
  VAULT_ENTRY_STATES,
  VAULT_PURPOSES,
  VAULT_ACCESS_RESULTS,
  PROCESSING_DESTINATIONS,
  POLICY_ACTIONS,
  evaluatePiiPolicyItem,
  sanitizeRemotePayload,
  processOcrResult,
  detectPiiMultiSignal,
  evaluatePiiTaskRelevance
} from "../packages/privacy-core/src/index.js";

const vaultSrc = await readFile(resolve("packages/privacy-core/src/privacy-vault.js"), "utf8");
const configSrc = await readFile(resolve("packages/privacy-core/src/vault-config.js"), "utf8");

// 1. Verify required exports exist
const requiredVaultExports = [
  "createLocalPrivacyVault",
  "privacyVault",
  "storeSecret",
  "retrieveSecret",
  "hasSecret",
  "getVaultMetadata",
  "listVaultMetadata",
  "revokeSecret",
  "expireSecret",
  "clearVault",
  "cleanupExpiredEntries"
];
for (const exp of requiredVaultExports) {
  if (!vaultSrc.includes(exp)) {
    console.error(`privacy-vault.js must export ${exp}.`);
    process.exit(1);
  }
}

// 2. Verify contracts exist
if (!VAULT_ENTRY_STATES.ACTIVE || !VAULT_ENTRY_STATES.EXPIRED || !VAULT_ENTRY_STATES.REVOKED) {
  console.error("Vault entry states must define ACTIVE, EXPIRED, REVOKED.");
  process.exit(1);
}

if (!VAULT_PURPOSES.LOGIN || !VAULT_PURPOSES.FORM_FILL || !VAULT_PURPOSES.CHECKOUT || !VAULT_PURPOSES.SEARCH) {
  console.error("Vault purposes must define LOGIN, FORM_FILL, CHECKOUT, SEARCH.");
  process.exit(1);
}

if (!VAULT_ACCESS_RESULTS.GRANTED || !VAULT_ACCESS_RESULTS.DENIED_UNAUTHORIZED || !VAULT_ACCESS_RESULTS.DENIED_REMOTE_DESTINATION) {
  console.error("Vault access results must define GRANTED, DENIED_UNAUTHORIZED, DENIED_REMOTE_DESTINATION.");
  process.exit(1);
}

// 3. Verify vault configuration exists
if (!VAULT_CONFIG || VAULT_CONFIG.DEFAULT_TTL_MS !== 300000 || VAULT_CONFIG.MAX_ENTRIES !== 100) {
  console.error("Vault configuration is invalid or missing required defaults.");
  process.exit(1);
}

// 4. Test storage and opaque ID generation
clearVault();
const stored = storeSecret({
  category: "password",
  secretValue: "LocalPass123!",
  purpose: VAULT_PURPOSES.LOGIN
});

if (!stored.ok || !stored.vaultId || !stored.vaultId.startsWith("VAULT_SEC_")) {
  console.error("Vault storeSecret failed to generate an opaque identifier.");
  process.exit(1);
}

// 5. Test authorized local retrieval
const retrieved = retrieveSecret({
  vaultId: stored.vaultId,
  purpose: VAULT_PURPOSES.LOGIN,
  destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
  authorization: { authorizationGranted: true }
});

if (!retrieved.ok || retrieved.secretValue !== "LocalPass123!") {
  console.error("Vault authorized retrieval failed.");
  process.exit(1);
}

// 6. Test unauthorized retrieval rejection
const unauth = retrieveSecret({
  vaultId: stored.vaultId,
  purpose: VAULT_PURPOSES.LOGIN,
  destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
  authorization: { authorizationGranted: false }
});

if (unauth.ok || unauth.result !== VAULT_ACCESS_RESULTS.DENIED_UNAUTHORIZED) {
  console.error("Vault failed to reject unauthorized retrieval.");
  process.exit(1);
}

// 7. Test remote destination retrieval rejection (Security Invariants 1 & 2)
const remoteAttempt = retrieveSecret({
  vaultId: stored.vaultId,
  purpose: VAULT_PURPOSES.LOGIN,
  destination: PROCESSING_DESTINATIONS.REMOTE_REASONING,
  authorization: { authorizationGranted: true }
});

if (remoteAttempt.ok || remoteAttempt.result !== VAULT_ACCESS_RESULTS.DENIED_REMOTE_DESTINATION) {
  console.error("CRITICAL SECURITY VIOLATION: Remote destination was able to retrieve vault secret.");
  process.exit(1);
}

// 8. Test purpose isolation
const mismatch = retrieveSecret({
  vaultId: stored.vaultId,
  purpose: VAULT_PURPOSES.CHECKOUT,
  destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
  authorization: { authorizationGranted: true }
});

if (mismatch.ok || mismatch.result !== VAULT_ACCESS_RESULTS.DENIED_PURPOSE_MISMATCH) {
  console.error("Vault failed to enforce purpose isolation.");
  process.exit(1);
}

// 9. Test revocation
const revoked = revokeSecret(stored.vaultId);
if (!revoked || hasSecret(stored.vaultId)) {
  console.error("Vault secret revocation failed.");
  process.exit(1);
}

// 10. Test zero raw PII in metadata
const meta = getVaultMetadata(stored.vaultId);
if (meta.secretValue !== undefined || JSON.stringify(meta).includes("LocalPass123!")) {
  console.error("Vault metadata leaked raw secret.");
  process.exit(1);
}

// 11. Test capacity enforcement (Max Entries)
const customVault = createLocalPrivacyVault({ MAX_ENTRIES: 2 });
customVault.storeSecret({ category: "password", secretValue: "p1", purpose: VAULT_PURPOSES.LOGIN });
customVault.storeSecret({ category: "password", secretValue: "p2", purpose: VAULT_PURPOSES.LOGIN });
const overflow = customVault.storeSecret({ category: "password", secretValue: "p3", purpose: VAULT_PURPOSES.LOGIN });
if (overflow.ok || overflow.result !== VAULT_ACCESS_RESULTS.DENIED_INVALID_REQUEST) {
  console.error("Vault failed to enforce maximum entry capacity limit.");
  process.exit(1);
}

// 12. Test Step 8 integration: policy REDACT cannot be stored
const redactPolicy = { action: POLICY_ACTIONS.REDACT };
const redactStore = storeSecret({ category: "password", secretValue: "pass", purpose: VAULT_PURPOSES.LOGIN, policyDecision: redactPolicy });
if (redactStore.ok) {
  console.error("Vault bypassed Step 8 REDACT policy decision.");
  process.exit(1);
}

// 13. Backward Compatibility - Steps 5, 6, 7, 8
const ocr = processOcrResult([{ text: "sample@domain.org", bbox: { x: 0, y: 0, width: 50, height: 20 }, confidence: 95 }]);
if (ocr.length !== 1 || ocr[0].category !== "email") {
  console.error("Step 5 OCR integrity check failed.");
  process.exit(1);
}

const multiSignal = detectPiiMultiSignal({ domItems: [{ category: "email", bbox: { x: 10, y: 10, width: 50, height: 20 }, source: "dom" }] });
if (multiSignal.length !== 1) {
  console.error("Step 6 Multi-signal integrity check failed.");
  process.exit(1);
}

const relevance = evaluatePiiTaskRelevance({ userInstruction: "Find my email", piiItems: [{ id: "P1", category: "email", confidence: 0.95 }] });
if (relevance.piiRelevance[0].relevance !== "REQUIRED") {
  console.error("Step 7 Context integrity check failed.");
  process.exit(1);
}

const policy = evaluatePiiPolicyItem({ piiItem: { id: "P1", category: "email", confidence: 0.95 }, relevanceItem: { relevance: "REQUIRED", relevanceConfidence: 0.95 }, destination: "REMOTE_REASONING" });
if (policy.action !== POLICY_ACTIONS.TOKENIZE) {
  console.error("Step 8 Policy Engine integrity check failed.");
  process.exit(1);
}

console.log("Step 9 verification passed: Secure Local Privacy Vault, local storage, authorized retrieval, remote destination boundary, purpose isolation, revocation, capacity limits, Step 8 integration, and backward compatibility verified.");
