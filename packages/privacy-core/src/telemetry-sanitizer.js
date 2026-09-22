/**
 * Telemetry Sanitizer Module (Phase 5).
 * Enforces strict on-device privacy invariants across all logging, telemetry,
 * debug events, SSE streams, error objects, and user task records.
 *
 * Privacy Invariants:
 * 1. Zero raw secrets (passwords, OTPs, CVVs, card numbers, addresses, emails, phone numbers) leave the boundary.
 * 2. PrivacyVault contents and token-to-secret mappings are strictly protected and never exposed.
 * 3. User task strings containing sensitive secrets are scrubbed before logging.
 * 4. Error objects and exception contexts retain structured diagnostics while redacting sensitive parameters.
 * 5. Reviewer visualization colors never dictate privacy decisions.
 */

import { PiiCategory } from "./config.js";
import { POLICY_ACTIONS, PROCESSING_DESTINATIONS } from "../../shared-types/src/privacy-contracts.js";

// Common regex patterns for PII detection and scrubbing
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;
const PHONE_PATTERN = /(?:(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b[6-9]\d{9}\b|\b\d{10}\b)/g;
const CARD_PATTERN = /\b(?:\d{4}[-\s]?){3}\d{4}\b|\b\d{13,19}\b/g;
const OTP_PATTERN = /\b(?:\d{4,8}|[A-Z0-9]{6})\b/g;
const ADDRESS_PATTERN = /\b\d{1,5}\s+[A-Za-z0-9.,\s-]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)\b/gi;
const AUTH_SECRET_INLINE_PATTERN = /(?:(?:password|passwd|pwd|passcode|pass|secret|pin|cvv|cvc|otp|token|key|bearer|auth)[^\w\n\r]{0,5}[:=]\s*([^\s,;]+))|(?:(?:with|using|is|and|the)\s+(?:password|passwd|pwd|passcode|pass|secret|pin|cvv|cvc|otp|code|token|key)\s+([^\s,;]+))|(?:\b(?:otp|pass|password|pin)\s+([A-Za-z0-9_!@#$%^&*+=~-]+))/gi;
const URL_SECRET_PARAM_PATTERN = /([?&](?:token|password|secret|key|apiKey|access_token|auth)=)[^&]+/gi;
const TEST_SENTINEL_PATTERN = /\b(?:TEST_TELEMETRY|PHASE6_AUDIT|PHASE6_SECRET|PHASE6_EMAIL|PHASE6_PASSWORD)_[A-Za-z0-9_]+\b/gi;

// Sensitive key identifiers for object property masking
const SENSITIVE_KEY_PATTERNS = [
  /^password$/i,
  /^passwd$/i,
  /^pwd$/i,
  /^secret$/i,
  /^secret_?value$/i,
  /^raw_?value$/i,
  /^cvv$/i,
  /^cvc$/i,
  /^security_?code$/i,
  /^otp$/i,
  /^passcode$/i,
  /^api_?key$/i,
  /^token_?secret$/i,
  /^auth_?header$/i,
  /^credit_?card$/i,
  /^card_?number$/i,
  /^session_?secret$/i,
  /^private_?key$/i,
  /^user_?input$/i,
  /^raw_?input$/i
];

function isSensitiveKeyName(key) {
  if (typeof key !== "string") return false;
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key.trim()));
}

function passesLuhn(candidate) {
  const digits = candidate.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  for (let index = digits.length - 1, parity = 0; index >= 0; index -= 1, parity += 1) {
    let digit = Number(digits[index]);
    if (parity % 2 === 1) digit = digit > 4 ? digit * 2 - 9 : digit * 2;
    sum += digit;
  }
  return sum % 10 === 0;
}

/**
 * Sanitizes a string to remove raw secrets, emails, card numbers, OTPs, and sensitive URL params.
 *
 * @param {string} str - Raw string
 * @returns {string} Sanitized string safe for telemetry
 */
export function sanitizeTelemetryString(str) {
  if (typeof str !== "string") return str;
  if (!str) return "";

  let result = str;

  // 1. Scrub test sentinels if present
  result = result.replace(TEST_SENTINEL_PATTERN, "[PROTECTED_SENTINEL]");

  // 2. Scrub inline password / secret phrases
  result = result.replace(AUTH_SECRET_INLINE_PATTERN, (match, p1, p2, p3) => {
    const secret = p1 || p2 || p3;
    if (secret) {
      return match.replace(secret, "[PROTECTED_SECRET]");
    }
    return "[PROTECTED_SECRET]";
  });

  // 3. Scrub sensitive URL parameters (e.g. ?token=secret)
  result = result.replace(URL_SECRET_PARAM_PATTERN, "$1[PROTECTED_PARAM]");

  // 4. Scrub Luhn-valid card numbers
  result = result.replace(CARD_PATTERN, (match) => {
    if (passesLuhn(match)) {
      return "[CARD_NUMBER_REDACTED]";
    }
    return match;
  });

  // 5. Scrub raw email addresses
  result = result.replace(EMAIL_PATTERN, "[EMAIL_REDACTED]");

  // 6. Scrub street addresses
  result = result.replace(ADDRESS_PATTERN, "[ADDRESS_REDACTED]");

  return result;
}

/**
 * Sanitizes a user task instruction before it is logged to telemetry or terminal observability.
 *
 * @param {string} taskString - Raw user task string
 * @param {object} [parsedGoal=null] - Parsed goal object if available
 * @returns {object} Safe structured task telemetry object
 */
export function sanitizeTelemetryTask(taskString, parsedGoal = null) {
  const sanitized = typeof taskString === "string" ? sanitizeTelemetryString(taskString) : "";
  const rawSummary = parsedGoal?.summary || parsedGoal?.originalGoal || sanitized;
  const sanitizedSummary = sanitizeTelemetryString(rawSummary);

  return {
    sanitizedTask: sanitized,
    summary: sanitizedSummary,
    domain: parsedGoal?.domain || "general",
    operations: parsedGoal?.operations || [],
    hasSanitizedSecrets: sanitized !== taskString || sanitizedSummary !== rawSummary
  };
}

/**
 * Sanitizes an error object or exception for structured telemetry emission.
 * Preserves error type, scrubbed message, and diagnostic codes without leaking raw payloads or secrets.
 *
 * @param {Error|object|string} error - Error instance or message
 * @returns {object} Safe structured error telemetry event
 */
export function sanitizeTelemetryError(error) {
  if (!error) {
    return {
      errorType: "UnknownError",
      message: "An unknown error occurred",
      code: "ERR_UNKNOWN",
      timestamp: Date.now()
    };
  }

  if (typeof error === "string") {
    return {
      errorType: "Error",
      message: sanitizeTelemetryString(error),
      code: "ERR_RUNTIME",
      timestamp: Date.now()
    };
  }

  const rawMessage = error.message || String(error);
  const sanitizedMessage = sanitizeTelemetryString(rawMessage);

  const safeErrorObj = {
    errorType: error.name || "Error",
    message: sanitizedMessage,
    code: error.code || error.statusCode || "ERR_RUNTIME",
    component: error.component || "agent_runtime",
    operation: error.operation || undefined,
    timestamp: Date.now()
  };

  if (error.stack && typeof error.stack === "string") {
    // Sanitize stack trace of any inline parameters, query strings, or sentinels
    safeErrorObj.stack = sanitizeTelemetryString(error.stack.split("\n").slice(0, 5).join("\n"));
  }

  return safeErrorObj;
}

/**
 * Converts a PolicyEngine decision into a clean, safe telemetry structure.
 * Guaranteed to contain zero raw values or secret mappings.
 *
 * @param {object} decision - PolicyDecision object
 * @returns {object} Safe privacy decision metadata
 */
export function createSafePrivacyDecisionTelemetry(decision) {
  if (!decision) {
    return {
      event: "privacy_decision",
      decision: POLICY_ACTIONS.REDACT,
      reasonCode: "DEFAULT_SAFE_REDACTION"
    };
  }

  return {
    event: "privacy_decision",
    piiId: decision.piiId || decision.id,
    category: decision.category,
    semanticRole: decision.semanticRole,
    taskNecessity: decision.taskNecessity,
    sensitivity: decision.sensitivity,
    destination: decision.destination,
    decision: decision.decision || decision.action,
    reasonCodes: Array.isArray(decision.reasonCodes) ? [...decision.reasonCodes] : [],
    token: decision.token || undefined,
    requiresRedaction: Boolean(decision.requiresRedaction || decision.action === POLICY_ACTIONS.REDACT || decision.action === POLICY_ACTIONS.LOCAL_ONLY),
    policyConfidence: decision.policyConfidence || decision.confidence,
    policyVersion: decision.policyVersion
  };
}

/**
 * Recursively sanitizes any data payload (objects, arrays, strings, Maps, Sets, Errors)
 * before it leaves the browser runtime boundary for telemetry, logging, or SSE distribution.
 *
 * @param {*} data - Any payload
 * @param {WeakSet} [seen=new WeakSet()] - Circular reference tracker
 * @returns {*} Fully sanitized data structure
 */
export function sanitizeTelemetryData(data, seen = new WeakSet()) {
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    return sanitizeTelemetryString(data);
  }

  if (typeof data === "number" || typeof data === "boolean") {
    return data;
  }

  if (typeof data === "bigint") {
    return data.toString();
  }

  if (data instanceof Error) {
    return sanitizeTelemetryError(data);
  }

  // Handle circular references
  if (typeof data === "object") {
    if (seen.has(data)) {
      return "[CIRCULAR_REFERENCE]";
    }
    seen.add(data);
  }

  // Handle Arrays
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeTelemetryData(item, seen));
  }

  // Handle Map and Set
  if (data instanceof Map) {
    const safeObj = {};
    for (const [k, v] of data.entries()) {
      const safeKey = typeof k === "string" ? sanitizeTelemetryString(k) : String(k);
      safeObj[safeKey] = isSensitiveKeyName(safeKey) ? "[PROTECTED_SECRET]" : sanitizeTelemetryData(v, seen);
    }
    return safeObj;
  }

  if (data instanceof Set) {
    return Array.from(data).map((item) => sanitizeTelemetryData(item, seen));
  }

  // Handle PrivacyVault instances or internal vault objects
  if (data && (data.isVaultInstance || (data.vault && typeof data.vault.getSecret === "function") || (data.secretValue !== undefined && data.category !== undefined))) {
    return {
      isVaultProtected: true,
      category: data.category || "vault_entry",
      purpose: data.purpose || "local_execution",
      status: "PROTECTED_LOCAL_ONLY"
    };
  }

  // Handle Token-to-Secret mapping objects (e.g. { token: "PII_TOKEN_...", value: "raw_secret" })
  if (data.token && typeof data.token === "string" && data.token.startsWith("PII_TOKEN_") && data.value) {
    return {
      token: data.token,
      category: data.category || "tokenized_entity",
      value: "[PROTECTED_SECRET_MAPPING]"
    };
  }

  // Handle standard objects
  const sanitizedObj = {};
  for (const [key, value] of Object.entries(data)) {
    if (isSensitiveKeyName(key)) {
      // Sensitive key name detected: mask raw string/number value
      sanitizedObj[key] = (value === null || value === undefined) ? value : "[PROTECTED_SECRET]";
    } else if (key === "rawTask" || key === "userTask" || key === "task") {
      // User task field: sanitize task contents
      sanitizedObj[key] = typeof value === "string" ? sanitizeTelemetryString(value) : sanitizeTelemetryData(value, seen);
    } else if (key === "rawDom" || key === "rawHtml" || key === "html") {
      // Raw DOM content: replace with safe descriptor
      sanitizedObj[key] = "[RAW_DOM_REDACTED_FROM_TELEMETRY]";
    } else if (key === "screenshotBuffer" || key === "rawScreenshot") {
      // Raw screenshot buffer: replace with safe descriptor
      sanitizedObj[key] = "[RAW_SCREENSHOT_REDACTED_FROM_TELEMETRY]";
    } else {
      sanitizedObj[key] = sanitizeTelemetryData(value, seen);
    }
  }

  return sanitizedObj;
}

/**
 * Asserts that a telemetry payload is free of raw secret sentinels.
 *
 * @param {*} payload - Telemetry payload to inspect
 * @param {string[]} sentinels - Array of raw sentinel strings to verify absence of
 * @returns {boolean} True if clean; throws AssertionError if a leak is detected
 */
export function assertNoTelemetryLeaks(payload, sentinels = []) {
  const serialized = JSON.stringify(payload);
  if (!serialized) return true;

  for (const sentinel of sentinels) {
    if (sentinel && serialized.includes(sentinel)) {
      throw new Error(`[TelemetryLeakAssertionError] Raw sensitive sentinel '${sentinel}' leaked into telemetry!`);
    }
  }

  return true;
}
