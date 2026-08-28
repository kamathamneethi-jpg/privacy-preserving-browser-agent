/**
 * Centralized Configuration for the Secure Local Privacy Vault (Step 9).
 * Defines TTL limits, capacity limits, allowed purposes, and destination boundaries.
 */

import { PROCESSING_DESTINATIONS, VAULT_PURPOSES } from "../../shared-types/src/privacy-contracts.js";

export const VAULT_VERSION = "1.0.0";

export const VAULT_CONFIG = Object.freeze({
  DEFAULT_TTL_MS: 300_000,    // 5 minutes (300,000 ms)
  MAX_TTL_MS: 1_800_000,      // 30 minutes (1,800,000 ms)
  MIN_TTL_MS: 1_000,          // 1 second (1,000 ms)
  MAX_ENTRIES: 100,           // Maximum simultaneous in-memory entries (strictly enforced)
  MAX_SECRET_LENGTH: 10_000,  // Safety limit on secret string length

  ALLOWED_PURPOSES: Object.freeze([
    VAULT_PURPOSES.LOGIN,
    VAULT_PURPOSES.FORM_FILL,
    VAULT_PURPOSES.CHECKOUT,
    VAULT_PURPOSES.VERIFY_IDENTITY,
    VAULT_PURPOSES.CONTACT,
    VAULT_PURPOSES.SEARCH,
    VAULT_PURPOSES.LOCAL_ACTION
  ]),

  // Strictly local processing destinations permitted to store / retrieve raw secrets
  LOCAL_DESTINATIONS: Object.freeze([
    PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    PROCESSING_DESTINATIONS.LOCAL_EXTENSION
  ]),

  // Remote destinations strictly forbidden from accessing the vault
  FORBIDDEN_REMOTE_DESTINATIONS: Object.freeze([
    PROCESSING_DESTINATIONS.REMOTE_REASONING,
    PROCESSING_DESTINATIONS.REMOTE_SERVICE,
    PROCESSING_DESTINATIONS.UNKNOWN_DESTINATION
  ])
});
