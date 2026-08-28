/**
 * Secure Temporary In-Memory Local Privacy Vault Module (Step 9).
 * Provides a local-only protected in-memory storage and retrieval mechanism for sensitive PII
 * required for authorized local browser actions.
 *
 * Architecture & Privacy Principles:
 * 1. Sits strictly on the LOCAL side of the privacy boundary.
 * 2. Secrets are temporary and in-memory only (never written to localStorage, IndexedDB, or disk).
 * 3. Remote destinations are strictly forbidden from retrieving or storing raw vault secrets.
 * 4. Raw sensitive values are never exposed through metadata APIs, error objects, logs, or remote payloads.
 */

import {
  PROCESSING_DESTINATIONS,
  POLICY_ACTIONS,
  VAULT_ENTRY_STATES,
  VAULT_PURPOSES,
  VAULT_ACCESS_RESULTS
} from "../../shared-types/src/privacy-contracts.js";
import { VAULT_CONFIG, VAULT_VERSION } from "./vault-config.js";

/**
 * Generates an opaque, unpredictable vault record identifier.
 * Does not embed secrets, plain timestamps, or predictable integers.
 *
 * @returns {string} Opaque vault identifier (e.g. VAULT_SEC_7k3f9a2b1c4e)
 */
function generateOpaqueVaultId() {
  const randA = Math.random().toString(36).substring(2, 8);
  const randB = Math.random().toString(36).substring(2, 8);
  const randC = Math.random().toString(36).substring(2, 6);
  return `VAULT_SEC_${randA}${randB}${randC}`;
}

/**
 * Creates an isolated Local Privacy Vault instance.
 *
 * @param {object} [customConfig={}]
 * @returns {object} LocalPrivacyVault instance
 */
export function createLocalPrivacyVault(customConfig = {}) {
  const config = { ...VAULT_CONFIG, ...customConfig };

  // In-memory private storage map: vaultId -> private Record object
  const vaultStore = new Map();

  /**
   * Cleans up expired entries internally, wiping secret material from memory.
   */
  function cleanupExpiredEntries() {
    const now = Date.now();
    for (const [id, record] of vaultStore.entries()) {
      if (record.state === VAULT_ENTRY_STATES.ACTIVE && now >= record.expiresAt) {
        record.state = VAULT_ENTRY_STATES.EXPIRED;
        record.secretValue = null; // Wipe expired value immediately from memory
      }
    }
  }

  /**
   * Stores a sensitive value locally in the vault.
   *
   * @param {object} params
   * @param {string} params.category - PII Category
   * @param {string} params.secretValue - The raw sensitive string (stored strictly local)
   * @param {string} [params.piiId] - Associated PII entity ID
   * @param {string} [params.purpose=VAULT_PURPOSES.LOCAL_ACTION] - Authorized task purpose
   * @param {number} [params.ttlMs=VAULT_CONFIG.DEFAULT_TTL_MS] - Time to live in ms
   * @param {string} [params.destination=PROCESSING_DESTINATIONS.LOCAL_BROWSER] - Target destination
   * @param {object} [params.authorization={}] - User authorization state
   * @param {object} [params.policyDecision] - Step 8 Policy Engine decision
   * @returns {object} Result object with vaultId and safe metadata (NO raw secret)
   */
  function storeSecret(params = {}) {
    const safeParams = params ?? {};
    const {
      category,
      secretValue,
      piiId = `PII_${String(category || "ITEM").toUpperCase()}`,
      purpose = VAULT_PURPOSES.LOCAL_ACTION,
      ttlMs = config.DEFAULT_TTL_MS,
      destination = PROCESSING_DESTINATIONS.LOCAL_BROWSER,
      authorization = {},
      policyDecision = null
    } = safeParams;

    // 1. Validate request inputs
    if (!category || typeof category !== "string" || category.trim().length === 0) {
      return Object.freeze({
        ok: false,
        result: VAULT_ACCESS_RESULTS.DENIED_INVALID_REQUEST,
        reason: "Invalid or missing PII category for vault storage."
      });
    }

    if (!piiId || typeof piiId !== "string" || piiId.trim().length === 0) {
      return Object.freeze({
        ok: false,
        result: VAULT_ACCESS_RESULTS.DENIED_INVALID_REQUEST,
        reason: "Invalid or missing piiId for vault storage."
      });
    }

    if (secretValue === null || secretValue === undefined || typeof secretValue !== "string" || secretValue.length === 0) {
      return Object.freeze({
        ok: false,
        result: VAULT_ACCESS_RESULTS.DENIED_INVALID_REQUEST,
        reason: "Invalid or empty sensitive value provided."
      });
    }

    if (secretValue.length > config.MAX_SECRET_LENGTH) {
      return Object.freeze({
        ok: false,
        result: VAULT_ACCESS_RESULTS.DENIED_INVALID_REQUEST,
        reason: "Secret value exceeds maximum allowable length."
      });
    }

    // 2. Validate purpose
    const cleanPurpose = String(purpose || "").toUpperCase();
    if (!cleanPurpose || !config.ALLOWED_PURPOSES.includes(cleanPurpose)) {
      return Object.freeze({
        ok: false,
        result: VAULT_ACCESS_RESULTS.DENIED_INVALID_REQUEST,
        reason: `Purpose '${cleanPurpose}' is not in the allowed purposes list.`
      });
    }

    // 3. Destination guard: Remote destinations MUST ALWAYS be rejected
    if (config.FORBIDDEN_REMOTE_DESTINATIONS.includes(destination) || !config.LOCAL_DESTINATIONS.includes(destination)) {
      return Object.freeze({
        ok: false,
        result: VAULT_ACCESS_RESULTS.DENIED_REMOTE_DESTINATION,
        reason: "Raw secret values cannot be stored or transferred to remote destinations."
      });
    }

    // 4. Authorization check: If explicit authorization object with false is passed, reject
    const isAuthExplicitlyDenied = authorization?.authorizationGranted === false || authorization?.userAuthorized === false;
    if (isAuthExplicitlyDenied) {
      return Object.freeze({
        ok: false,
        result: VAULT_ACCESS_RESULTS.DENIED_UNAUTHORIZED,
        reason: "Vault storage requires authorization."
      });
    }

    // 5. Policy decision integration: Vault cannot override Step 8 REDACT decisions
    if (policyDecision && policyDecision.action === POLICY_ACTIONS.REDACT) {
      return Object.freeze({
        ok: false,
        result: VAULT_ACCESS_RESULTS.DENIED_INVALID_REQUEST,
        reason: "Vault storage rejected: Step 8 policy evaluated item as REDACT."
      });
    }

    cleanupExpiredEntries();

    // 6. Capacity limit check: Never overwrite existing secrets silently
    if (vaultStore.size >= config.MAX_ENTRIES) {
      return Object.freeze({
        ok: false,
        result: VAULT_ACCESS_RESULTS.DENIED_INVALID_REQUEST,
        reason: "Vault capacity limit reached (maximum 100 active entries)."
      });
    }

    // 7. Enforce TTL bounds
    const safeTtl = Math.min(config.MAX_TTL_MS, Math.max(config.MIN_TTL_MS, Number(ttlMs) || config.DEFAULT_TTL_MS));
    const now = Date.now();
    const vaultId = generateOpaqueVaultId();

    const record = {
      vaultId,
      piiId: String(piiId),
      category: String(category).toLowerCase(),
      purpose: cleanPurpose,
      secretValue: String(secretValue),
      createdAt: now,
      expiresAt: now + safeTtl,
      state: VAULT_ENTRY_STATES.ACTIVE,
      accessCount: 0,
      lastAccessedAt: null
    };

    vaultStore.set(vaultId, record);

    return Object.freeze({
      ok: true,
      vaultId,
      result: VAULT_ACCESS_RESULTS.GRANTED,
      metadata: Object.freeze({
        vaultId,
        piiId: record.piiId,
        category: record.category,
        purpose: record.purpose,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        state: record.state,
        vaultVersion: VAULT_VERSION
      })
    });
  }

  /**
   * Retrieves a sensitive value for an authorized local browser action.
   *
   * @param {object} params
   * @param {string} params.vaultId - Vault entry identifier
   * @param {string} params.purpose - Purpose of retrieval (must match stored purpose)
   * @param {string} [params.destination=PROCESSING_DESTINATIONS.LOCAL_BROWSER] - Target destination
   * @param {object} [params.authorization={}] - User authorization context
   * @returns {object} Access result. If authorized, contains secretValue; otherwise safe error.
   */
  function retrieveSecret(params = {}) {
    const safeParams = params ?? {};
    const {
      vaultId,
      purpose,
      destination = PROCESSING_DESTINATIONS.LOCAL_BROWSER,
      authorization = {}
    } = safeParams;

    // 1. Validate vaultId
    if (!vaultId || typeof vaultId !== "string" || vaultId.trim().length === 0) {
      return Object.freeze({
        ok: false,
        result: VAULT_ACCESS_RESULTS.DENIED_NOT_FOUND,
        reason: "Invalid or missing vault identifier."
      });
    }

    const record = vaultStore.get(vaultId);
    if (!record) {
      return Object.freeze({
        ok: false,
        result: VAULT_ACCESS_RESULTS.DENIED_NOT_FOUND,
        reason: "Vault entry not found."
      });
    }

    // 2. Invariant 1 & 2: Remote destinations can NEVER retrieve raw vault secrets
    if (config.FORBIDDEN_REMOTE_DESTINATIONS.includes(destination) || !config.LOCAL_DESTINATIONS.includes(destination)) {
      return Object.freeze({
        ok: false,
        result: VAULT_ACCESS_RESULTS.DENIED_REMOTE_DESTINATION,
        reason: "Remote destinations are strictly forbidden from retrieving raw vault secrets."
      });
    }

    // 3. Invariant 5: Revoked secrets cannot be retrieved
    if (record.state === VAULT_ENTRY_STATES.REVOKED) {
      return Object.freeze({
        ok: false,
        result: VAULT_ACCESS_RESULTS.DENIED_REVOKED,
        reason: "Vault entry has been revoked."
      });
    }

    // 4. Invariant 4: Expired secrets cannot be retrieved
    const now = Date.now();
    if (record.state === VAULT_ENTRY_STATES.EXPIRED || now >= record.expiresAt) {
      record.state = VAULT_ENTRY_STATES.EXPIRED;
      record.secretValue = null;
      return Object.freeze({
        ok: false,
        result: VAULT_ACCESS_RESULTS.DENIED_EXPIRED,
        reason: "Vault entry has expired."
      });
    }

    // 5. Invariant 2: Authorization is required for secret retrieval
    const authGranted = Boolean(authorization?.authorizationGranted ?? authorization?.userAuthorized ?? false);
    if (!authGranted) {
      return Object.freeze({
        ok: false,
        result: VAULT_ACCESS_RESULTS.DENIED_UNAUTHORIZED,
        reason: "Local action authorization not granted."
      });
    }

    // 6. Invariant 3: Purpose restrictions are strictly enforced (Purpose Isolation)
    const requestedPurpose = String(purpose || "").toUpperCase();
    if (!requestedPurpose || requestedPurpose !== record.purpose) {
      return Object.freeze({
        ok: false,
        result: VAULT_ACCESS_RESULTS.DENIED_PURPOSE_MISMATCH,
        reason: `Purpose mismatch: requested '${requestedPurpose}' but vault entry was authorized for '${record.purpose}'.`
      });
    }

    // Authorized retrieval succeeded
    record.accessCount += 1;
    record.lastAccessedAt = now;

    return Object.freeze({
      ok: true,
      result: VAULT_ACCESS_RESULTS.GRANTED,
      secretValue: record.secretValue,
      category: record.category,
      purpose: record.purpose,
      piiId: record.piiId,
      vaultId: record.vaultId
    });
  }

  /**
   * Checks whether an active, unexpired entry exists for a vaultId.
   *
   * @param {string} vaultId
   * @returns {boolean}
   */
  function hasSecret(vaultId) {
    if (!vaultId || typeof vaultId !== "string") return false;
    const record = vaultStore.get(vaultId);
    if (!record) return false;
    if (record.state !== VAULT_ENTRY_STATES.ACTIVE) return false;
    if (Date.now() >= record.expiresAt) {
      record.state = VAULT_ENTRY_STATES.EXPIRED;
      record.secretValue = null;
      return false;
    }
    return true;
  }

  /**
   * Returns safe metadata for a vault entry. Zero raw secret is exposed.
   *
   * @param {string} vaultId
   * @returns {object|null} Sanitized metadata or null
   */
  function getVaultMetadata(vaultId) {
    if (!vaultId || typeof vaultId !== "string") return null;
    const record = vaultStore.get(vaultId);
    if (!record) return null;

    const now = Date.now();
    const isExpired = now >= record.expiresAt;
    const state = isExpired ? VAULT_ENTRY_STATES.EXPIRED : record.state;

    return Object.freeze({
      vaultId: record.vaultId,
      piiId: record.piiId,
      category: record.category,
      purpose: record.purpose,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      timeRemainingMs: Math.max(0, record.expiresAt - now),
      state,
      accessCount: record.accessCount,
      lastAccessedAt: record.lastAccessedAt,
      vaultVersion: VAULT_VERSION
    });
  }

  /**
   * Lists safe metadata for all active entries in the vault.
   *
   * @returns {Array<object>} Array of safe metadata objects
   */
  function listVaultMetadata() {
    cleanupExpiredEntries();
    const list = [];
    for (const id of vaultStore.keys()) {
      const meta = getVaultMetadata(id);
      if (meta && meta.state === VAULT_ENTRY_STATES.ACTIVE) {
        list.push(meta);
      }
    }
    return list;
  }

  /**
   * Revokes a vault entry, immediately wiping the secret value from memory.
   *
   * @param {string} vaultId
   * @returns {boolean} True if revoked, false if not found
   */
  function revokeSecret(vaultId) {
    if (!vaultId || typeof vaultId !== "string") return false;
    const record = vaultStore.get(vaultId);
    if (!record) return false;

    record.state = VAULT_ENTRY_STATES.REVOKED;
    record.secretValue = null; // Immediately clear secret from memory
    return true;
  }

  /**
   * Forces expiration of a vault entry.
   *
   * @param {string} vaultId
   * @returns {boolean}
   */
  function expireSecret(vaultId) {
    if (!vaultId || typeof vaultId !== "string") return false;
    const record = vaultStore.get(vaultId);
    if (!record) return false;

    record.state = VAULT_ENTRY_STATES.EXPIRED;
    record.expiresAt = Date.now() - 1000;
    record.secretValue = null;
    return true;
  }

  /**
   * Wipes all entries from the vault.
   */
  function clearVault() {
    for (const record of vaultStore.values()) {
      record.secretValue = null;
    }
    vaultStore.clear();
  }

  /**
   * Returns current active entry count.
   *
   * @returns {number}
   */
  function getVaultSize() {
    cleanupExpiredEntries();
    let count = 0;
    for (const record of vaultStore.values()) {
      if (record.state === VAULT_ENTRY_STATES.ACTIVE) count += 1;
    }
    return count;
  }

  return Object.freeze({
    storeSecret,
    retrieveSecret,
    hasSecret,
    getVaultMetadata,
    listVaultMetadata,
    revokeSecret,
    expireSecret,
    clearVault,
    cleanupExpiredEntries,
    getVaultSize
  });
}

// Default singleton vault instance for the application runtime
export const privacyVault = createLocalPrivacyVault();

// Convenience module exports delegating to default privacyVault singleton
export function storeSecret(params) {
  return privacyVault.storeSecret(params);
}

export function retrieveSecret(params) {
  return privacyVault.retrieveSecret(params);
}

export function hasSecret(vaultId) {
  return privacyVault.hasSecret(vaultId);
}

export function getVaultMetadata(vaultId) {
  return privacyVault.getVaultMetadata(vaultId);
}

export function listVaultMetadata() {
  return privacyVault.listVaultMetadata();
}

export function revokeSecret(vaultId) {
  return privacyVault.revokeSecret(vaultId);
}

export function expireSecret(vaultId) {
  return privacyVault.expireSecret(vaultId);
}

export function clearVault() {
  return privacyVault.clearVault();
}

export function cleanupExpiredEntries() {
  return privacyVault.cleanupExpiredEntries();
}
