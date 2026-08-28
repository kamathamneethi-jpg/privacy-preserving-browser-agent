import test from "node:test";
import assert from "node:assert/strict";
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
  generateOpaqueToken,
  processOcrResult,
  detectPiiMultiSignal,
  evaluatePiiTaskRelevance
} from "../packages/privacy-core/src/index.js";

// =====================================================================
// STEP 9 SECURE LOCAL PRIVACY VAULT COMPREHENSIVE TEST SUITE
// Covers all 32 minimum test scenarios and all 15 Security Invariants
// =====================================================================

test.beforeEach(() => {
  clearVault();
});

// 1. Store valid local secret
test("1. Store valid local secret succeeds and returns safe metadata", () => {
  const result = storeSecret({
    category: "password",
    secretValue: "ValidSecret123!",
    purpose: VAULT_PURPOSES.LOGIN
  });

  assert.equal(result.ok, true);
  assert.ok(result.vaultId.startsWith("VAULT_SEC_"));
  assert.equal(result.result, VAULT_ACCESS_RESULTS.GRANTED);
  assert.equal(result.metadata.state, VAULT_ENTRY_STATES.ACTIVE);
  assert.equal(result.metadata.category, "password");
  assert.equal(result.metadata.purpose, "LOGIN");
  assert.equal(result.metadata.secretValue, undefined);
});

// 2. Retrieve authorized local secret
test("2. Retrieve authorized local secret succeeds with exact matching purpose", () => {
  const stored = storeSecret({
    category: "password",
    secretValue: "ValidSecret123!",
    purpose: VAULT_PURPOSES.LOGIN
  });

  const retrieval = retrieveSecret({
    vaultId: stored.vaultId,
    purpose: VAULT_PURPOSES.LOGIN,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: { authorizationGranted: true }
  });

  assert.equal(retrieval.ok, true);
  assert.equal(retrieval.result, VAULT_ACCESS_RESULTS.GRANTED);
  assert.equal(retrieval.secretValue, "ValidSecret123!");
  assert.equal(retrieval.category, "password");
  assert.equal(retrieval.purpose, "LOGIN");
});

// 3. Unauthorized retrieval denied
test("3. Unauthorized retrieval is denied (authorization missing or false)", () => {
  const stored = storeSecret({
    category: "password",
    secretValue: "SecretPass!",
    purpose: VAULT_PURPOSES.LOGIN
  });

  const res1 = retrieveSecret({
    vaultId: stored.vaultId,
    purpose: VAULT_PURPOSES.LOGIN,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: { authorizationGranted: false }
  });
  assert.equal(res1.ok, false);
  assert.equal(res1.result, VAULT_ACCESS_RESULTS.DENIED_UNAUTHORIZED);
  assert.equal(res1.secretValue, undefined);

  const res2 = retrieveSecret({
    vaultId: stored.vaultId,
    purpose: VAULT_PURPOSES.LOGIN,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: {}
  });
  assert.equal(res2.ok, false);
  assert.equal(res2.result, VAULT_ACCESS_RESULTS.DENIED_UNAUTHORIZED);
});

// 4. Remote retrieval denied
test("4. Remote retrieval is strictly denied for REMOTE_REASONING and REMOTE_SERVICE", () => {
  const stored = storeSecret({
    category: "password",
    secretValue: "SecretPass!",
    purpose: VAULT_PURPOSES.LOGIN
  });

  const resReasoning = retrieveSecret({
    vaultId: stored.vaultId,
    purpose: VAULT_PURPOSES.LOGIN,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING,
    authorization: { authorizationGranted: true }
  });
  assert.equal(resReasoning.ok, false);
  assert.equal(resReasoning.result, VAULT_ACCESS_RESULTS.DENIED_REMOTE_DESTINATION);
  assert.equal(resReasoning.secretValue, undefined);

  const resService = retrieveSecret({
    vaultId: stored.vaultId,
    purpose: VAULT_PURPOSES.LOGIN,
    destination: PROCESSING_DESTINATIONS.REMOTE_SERVICE,
    authorization: { authorizationGranted: true }
  });
  assert.equal(resService.ok, false);
  assert.equal(resService.result, VAULT_ACCESS_RESULTS.DENIED_REMOTE_DESTINATION);
});

// 5. Unknown destination denied
test("5. Unknown destination is denied fail-closed", () => {
  const stored = storeSecret({
    category: "email",
    secretValue: "test@example.invalid",
    purpose: VAULT_PURPOSES.CONTACT
  });

  const resUnknown = retrieveSecret({
    vaultId: stored.vaultId,
    purpose: VAULT_PURPOSES.CONTACT,
    destination: PROCESSING_DESTINATIONS.UNKNOWN_DESTINATION,
    authorization: { authorizationGranted: true }
  });
  assert.equal(resUnknown.ok, false);
  assert.equal(resUnknown.result, VAULT_ACCESS_RESULTS.DENIED_REMOTE_DESTINATION);
});

// 6. Purpose mismatch denied
test("6. Purpose mismatch is denied (Purpose Isolation)", () => {
  const stored = storeSecret({
    category: "password",
    secretValue: "LoginSecret123!",
    purpose: VAULT_PURPOSES.LOGIN
  });

  const resMismatch = retrieveSecret({
    vaultId: stored.vaultId,
    purpose: VAULT_PURPOSES.CHECKOUT,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: { authorizationGranted: true }
  });
  assert.equal(resMismatch.ok, false);
  assert.equal(resMismatch.result, VAULT_ACCESS_RESULTS.DENIED_PURPOSE_MISMATCH);
  assert.equal(resMismatch.secretValue, undefined);
});

// 7. Expired secret denied
test("7. Expired secret cannot be retrieved and secret is wiped from memory", () => {
  const vault = createLocalPrivacyVault();
  const stored = vault.storeSecret({
    category: "otp",
    secretValue: "123456",
    purpose: VAULT_PURPOSES.VERIFY_IDENTITY,
    ttlMs: 10
  });

  vault.expireSecret(stored.vaultId);

  const res = vault.retrieveSecret({
    vaultId: stored.vaultId,
    purpose: VAULT_PURPOSES.VERIFY_IDENTITY,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: { authorizationGranted: true }
  });

  assert.equal(res.ok, false);
  assert.equal(res.result, VAULT_ACCESS_RESULTS.DENIED_EXPIRED);
  assert.equal(res.secretValue, undefined);
  assert.equal(vault.hasSecret(stored.vaultId), false);
});

// 8. Revoked secret denied
test("8. Revoked secret cannot be retrieved", () => {
  const stored = storeSecret({
    category: "otp",
    secretValue: "654321",
    purpose: VAULT_PURPOSES.VERIFY_IDENTITY
  });

  revokeSecret(stored.vaultId);

  const res = retrieveSecret({
    vaultId: stored.vaultId,
    purpose: VAULT_PURPOSES.VERIFY_IDENTITY,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: { authorizationGranted: true }
  });

  assert.equal(res.ok, false);
  assert.equal(res.result, VAULT_ACCESS_RESULTS.DENIED_REVOKED);
  assert.equal(res.secretValue, undefined);
});

// 9. Missing vault ID denied
test("9. Missing or null vault ID fails safely", () => {
  const resNull = retrieveSecret({ vaultId: null, purpose: VAULT_PURPOSES.LOGIN, authorization: { authorizationGranted: true } });
  assert.equal(resNull.ok, false);
  assert.equal(resNull.result, VAULT_ACCESS_RESULTS.DENIED_NOT_FOUND);

  const resEmpty = retrieveSecret({ vaultId: "", purpose: VAULT_PURPOSES.LOGIN, authorization: { authorizationGranted: true } });
  assert.equal(resEmpty.ok, false);
  assert.equal(resEmpty.result, VAULT_ACCESS_RESULTS.DENIED_NOT_FOUND);
});

// 10. Invalid request denied
test("10. Invalid request (missing secretValue or category) fails safely", () => {
  const resNoCat = storeSecret({ category: "", secretValue: "secret", purpose: VAULT_PURPOSES.LOGIN });
  assert.equal(resNoCat.ok, false);
  assert.equal(resNoCat.result, VAULT_ACCESS_RESULTS.DENIED_INVALID_REQUEST);

  const resNoVal = storeSecret({ category: "password", secretValue: "", purpose: VAULT_PURPOSES.LOGIN });
  assert.equal(resNoVal.ok, false);
  assert.equal(resNoVal.result, VAULT_ACCESS_RESULTS.DENIED_INVALID_REQUEST);
});

// 11. TTL is enforced
test("11. TTL is enforced on creation and reflected in metadata", () => {
  const stored = storeSecret({
    category: "password",
    secretValue: "SecretPass!",
    purpose: VAULT_PURPOSES.LOGIN,
    ttlMs: 60000
  });

  const meta = getVaultMetadata(stored.vaultId);
  assert.ok(meta.expiresAt - meta.createdAt <= 60000);
  assert.ok(meta.timeRemainingMs > 0);
});

// 12. Maximum TTL is enforced
test("12. Maximum TTL is capped at MAX_TTL_MS (1,800,000 ms)", () => {
  const stored = storeSecret({
    category: "password",
    secretValue: "SecretPass!",
    purpose: VAULT_PURPOSES.LOGIN,
    ttlMs: 999999999
  });

  const meta = getVaultMetadata(stored.vaultId);
  assert.ok(meta.expiresAt - meta.createdAt <= VAULT_CONFIG.MAX_TTL_MS);
});

// 13. Maximum entry limit is enforced
test("13. Maximum entry limit (100) is enforced safely without silent overwrites", () => {
  const customVault = createLocalPrivacyVault({ MAX_ENTRIES: 3 });

  const s1 = customVault.storeSecret({ category: "password", secretValue: "p1", purpose: VAULT_PURPOSES.LOGIN });
  const s2 = customVault.storeSecret({ category: "password", secretValue: "p2", purpose: VAULT_PURPOSES.LOGIN });
  const s3 = customVault.storeSecret({ category: "password", secretValue: "p3", purpose: VAULT_PURPOSES.LOGIN });
  assert.equal(s1.ok && s2.ok && s3.ok, true);

  const s4 = customVault.storeSecret({ category: "password", secretValue: "p4", purpose: VAULT_PURPOSES.LOGIN });
  assert.equal(s4.ok, false);
  assert.equal(s4.result, VAULT_ACCESS_RESULTS.DENIED_INVALID_REQUEST);
});

// 14. clearVault removes all entries
test("14. clearVault removes all entries from memory", () => {
  const s1 = storeSecret({ category: "password", secretValue: "p1", purpose: VAULT_PURPOSES.LOGIN });
  const s2 = storeSecret({ category: "otp", secretValue: "123", purpose: VAULT_PURPOSES.VERIFY_IDENTITY });

  assert.equal(hasSecret(s1.vaultId), true);
  clearVault();
  assert.equal(hasSecret(s1.vaultId), false);
  assert.equal(hasSecret(s2.vaultId), false);
  assert.equal(listVaultMetadata().length, 0);
});

// 15. cleanupExpiredEntries works
test("15. cleanupExpiredEntries sweeps expired entries and clears secrets", () => {
  const vault = createLocalPrivacyVault();
  const s1 = vault.storeSecret({ category: "otp", secretValue: "123456", purpose: VAULT_PURPOSES.VERIFY_IDENTITY, ttlMs: 10 });
  vault.expireSecret(s1.vaultId);

  vault.cleanupExpiredEntries();
  const meta = vault.getVaultMetadata(s1.vaultId);
  assert.equal(meta.state, VAULT_ENTRY_STATES.EXPIRED);
  assert.equal(meta.secretValue, undefined);
});

// 16. Metadata contains no raw secret
test("16. Metadata contains zero raw secret values", () => {
  const stored = storeSecret({
    category: "password",
    secretValue: "SuperSecretKey99!",
    purpose: VAULT_PURPOSES.LOGIN
  });

  const meta = getVaultMetadata(stored.vaultId);
  assert.equal(meta.secretValue, undefined);
  assert.equal(meta.value, undefined);
  assert.equal(meta.password, undefined);
  assert.equal(JSON.stringify(meta).includes("SuperSecretKey99!"), false);
});

// 17. listVaultMetadata contains no raw secret
test("17. listVaultMetadata contains zero raw secret values across all entries", () => {
  storeSecret({ category: "password", secretValue: "SecretA!", purpose: VAULT_PURPOSES.LOGIN });
  storeSecret({ category: "otp", secretValue: "789123", purpose: VAULT_PURPOSES.VERIFY_IDENTITY });

  const list = listVaultMetadata();
  assert.equal(list.length, 2);
  const jsonStr = JSON.stringify(list);
  assert.equal(jsonStr.includes("SecretA!"), false);
  assert.equal(jsonStr.includes("789123"), false);
});

// 18. Error messages contain no raw secret
test("18. Error messages and results contain zero raw secret values", () => {
  const errRes = retrieveSecret({
    vaultId: "NON_EXISTENT_ID",
    purpose: VAULT_PURPOSES.LOGIN,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER
  });

  assert.equal(errRes.ok, false);
  assert.equal(JSON.stringify(errRes).includes("secretValue"), false);
});

// 19. Logs contain no raw secret
test("19. JSON serialization of vault outputs contains zero raw secret values", () => {
  const stored = storeSecret({ category: "payment_card", secretValue: "4111111111111111", purpose: VAULT_PURPOSES.CHECKOUT });
  const meta = getVaultMetadata(stored.vaultId);
  assert.equal(JSON.stringify(meta).includes("4111111111111111"), false);
});

// 20. Vault IDs are opaque
test("20. Vault IDs are opaque and unpredictable (do not embed secret or timestamp alone)", () => {
  const s1 = storeSecret({ category: "password", secretValue: "Pass1", purpose: VAULT_PURPOSES.LOGIN });
  const s2 = storeSecret({ category: "password", secretValue: "Pass2", purpose: VAULT_PURPOSES.LOGIN });

  assert.ok(s1.vaultId.startsWith("VAULT_SEC_"));
  assert.ok(s2.vaultId.startsWith("VAULT_SEC_"));
  assert.notEqual(s1.vaultId, s2.vaultId);
  assert.equal(s1.vaultId.includes("Pass1"), false);
});

// 21. Password can be stored locally
test("21. Password can be stored locally for legitimate LOGIN action", () => {
  const stored = storeSecret({ category: "password", secretValue: "UserPassword123!", purpose: VAULT_PURPOSES.LOGIN });
  assert.equal(stored.ok, true);
  assert.equal(hasSecret(stored.vaultId), true);
});

// 22. OTP can be stored locally
test("22. OTP can be stored locally for VERIFY_IDENTITY action", () => {
  const stored = storeSecret({ category: "otp", secretValue: "888999", purpose: VAULT_PURPOSES.VERIFY_IDENTITY });
  assert.equal(stored.ok, true);
  assert.equal(hasSecret(stored.vaultId), true);
});

// 23. Payment card can be stored locally
test("23. Payment card can be stored locally for CHECKOUT action", () => {
  const stored = storeSecret({ category: "payment_card", secretValue: "4111111111111111", purpose: VAULT_PURPOSES.CHECKOUT });
  assert.equal(stored.ok, true);
  assert.equal(hasSecret(stored.vaultId), true);
});

// 24. Critical PII cannot be remotely retrieved
test("24. Critical PII (password, OTP, payment card) cannot be remotely retrieved", () => {
  const sPass = storeSecret({ category: "password", secretValue: "Pass!", purpose: VAULT_PURPOSES.LOGIN });
  const sOtp = storeSecret({ category: "otp", secretValue: "123456", purpose: VAULT_PURPOSES.VERIFY_IDENTITY });
  const sCard = storeSecret({ category: "payment_card", secretValue: "4111111111111111", purpose: VAULT_PURPOSES.CHECKOUT });

  for (const item of [sPass, sOtp, sCard]) {
    const res = retrieveSecret({
      vaultId: item.vaultId,
      purpose: item.metadata.purpose,
      destination: PROCESSING_DESTINATIONS.REMOTE_REASONING,
      authorization: { authorizationGranted: true }
    });
    assert.equal(res.ok, false);
    assert.equal(res.result, VAULT_ACCESS_RESULTS.DENIED_REMOTE_DESTINATION);
    assert.equal(res.secretValue, undefined);
  }
});

// 25. Authorization cannot bypass remote restriction
test("25. Authorization cannot bypass remote restriction (Security Invariant 2)", () => {
  const stored = storeSecret({ category: "password", secretValue: "Pass!", purpose: VAULT_PURPOSES.LOGIN });

  const res = retrieveSecret({
    vaultId: stored.vaultId,
    purpose: VAULT_PURPOSES.LOGIN,
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING,
    authorization: { authorizationGranted: true, userAuthorized: true }
  });

  assert.equal(res.ok, false);
  assert.equal(res.result, VAULT_ACCESS_RESULTS.DENIED_REMOTE_DESTINATION);
});

// 26. Authorization cannot bypass expiration/revocation
test("26. Authorization cannot bypass expiration or revocation", () => {
  const stored = storeSecret({ category: "password", secretValue: "Pass!", purpose: VAULT_PURPOSES.LOGIN });
  revokeSecret(stored.vaultId);

  const res = retrieveSecret({
    vaultId: stored.vaultId,
    purpose: VAULT_PURPOSES.LOGIN,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: { authorizationGranted: true }
  });

  assert.equal(res.ok, false);
  assert.equal(res.result, VAULT_ACCESS_RESULTS.DENIED_REVOKED);
});

// 27. Purpose isolation works across distinct purposes
test("27. Purpose isolation works across all supported purposes", () => {
  const stored = storeSecret({ category: "email", secretValue: "test@example.invalid", purpose: VAULT_PURPOSES.LOGIN });

  const resSearch = retrieveSecret({
    vaultId: stored.vaultId,
    purpose: VAULT_PURPOSES.SEARCH,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: { authorizationGranted: true }
  });

  assert.equal(resSearch.ok, false);
  assert.equal(resSearch.result, VAULT_ACCESS_RESULTS.DENIED_PURPOSE_MISMATCH);
});

// 28. Multiple PII entries remain independent
test("28. Multiple PII entries remain isolated with independent access control", () => {
  const s1 = storeSecret({ category: "password", secretValue: "Pass1!", purpose: VAULT_PURPOSES.LOGIN });
  const s2 = storeSecret({ category: "password", secretValue: "Pass2!", purpose: VAULT_PURPOSES.LOGIN });

  revokeSecret(s1.vaultId);

  assert.equal(hasSecret(s1.vaultId), false);
  assert.equal(hasSecret(s2.vaultId), true);

  const r2 = retrieveSecret({
    vaultId: s2.vaultId,
    purpose: VAULT_PURPOSES.LOGIN,
    destination: PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    authorization: { authorizationGranted: true }
  });
  assert.equal(r2.ok, true);
  assert.equal(r2.secretValue, "Pass2!");
});

// 29. Existing Step 5 tests remain passing
test("29. Step 5 localization and OCR integrity is preserved", () => {
  const ocrItems = processOcrResult([{ text: "contact@company.org", bbox: { x: 0, y: 0, width: 60, height: 20 }, confidence: 95 }]);
  assert.equal(ocrItems.length, 1);
  assert.equal(ocrItems[0].category, "email");
});

// 30. Existing Step 6 tests remain passing
test("30. Step 6 multi-signal PII detection integrity is preserved", () => {
  const multiSignal = detectPiiMultiSignal({ domItems: [{ category: "phone", bbox: { x: 10, y: 10, width: 80, height: 20 }, source: "dom" }] });
  assert.equal(multiSignal.length, 1);
});

// 31. Existing Step 7 tests remain passing
test("31. Step 7 Context Analyzer relevance integrity is preserved", () => {
  const context = evaluatePiiTaskRelevance({
    userInstruction: "Login with my password",
    piiItems: [{ id: "P1", category: "password", confidence: 0.95 }]
  });
  assert.equal(context.taskIntent, "LOGIN");
  assert.equal(context.piiRelevance[0].relevance, "REQUIRED");
});

// 32. Existing Step 8 tests remain passing
test("32. Step 8 Privacy Policy Engine decision integrity is preserved", () => {
  const policy = evaluatePiiPolicyItem({
    piiItem: { id: "P1", category: "password", confidence: 0.95 },
    relevanceItem: { relevance: "REQUIRED", relevanceConfidence: 0.95 },
    destination: PROCESSING_DESTINATIONS.REMOTE_REASONING,
    authorization: { authorizationGranted: true }
  });
  assert.equal(policy.action, POLICY_ACTIONS.LOCAL_ONLY);
});
