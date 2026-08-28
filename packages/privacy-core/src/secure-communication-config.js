/**
 * Centralized Configuration for Secure Communication Client (Step 16).
 * Defines transport limits, retry policies, status code classifications, and clock skew bounds.
 */

import { SECURE_TRANSPORT_TYPES } from "../../../packages/shared-types/src/privacy-contracts.js";

export const SECURE_COMM_VERSION = "1.0.0";

export const SECURE_COMM_CONFIG = Object.freeze({
  SECURE_COMM_VERSION: "1.0.0",
  DEFAULT_TRANSPORT: SECURE_TRANSPORT_TYPES.MOCK_TEST_TRANSPORT,
  REQUEST_TIMEOUT_MS: 5000,
  MAX_REQUEST_SIZE_BYTES: 250000,
  MAX_RESPONSE_SIZE_BYTES: 250000,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 200,
  MAX_CLOCK_SKEW_MS: 300000, // 5 minutes maximum clock skew for stale request protection
  REQUIRE_HTTPS_IN_PRODUCTION: true,
  FAIL_CLOSED_ON_SECURITY_ERROR: true,

  PERMITTED_REMOTE_PROTOCOLS: Object.freeze([
    "https:"
  ]),

  FORBIDDEN_PROTOCOLS: Object.freeze([
    "http:",
    "javascript:",
    "data:",
    "file:",
    "blob:"
  ]),

  RETRYABLE_STATUS_CODES: Object.freeze([
    408, // Request Timeout
    429, // Too Many Requests
    500, // Internal Server Error
    502, // Bad Gateway
    503, // Service Unavailable
    504  // Gateway Timeout
  ]),

  NON_RETRYABLE_STATUS_CODES: Object.freeze([
    400, // Bad Request / Validation Failure
    401, // Unauthorized
    403, // Forbidden
    422  // Unprocessable Entity
  ])
});
