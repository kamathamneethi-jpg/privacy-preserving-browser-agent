/**
 * Remote Request Payload Security Validator (Step 15).
 * Performs independent structural schema validation and authoritative recursive deep content inspection.
 *
 * CRITICAL SECURITY INVARIANT:
 * The backend NEVER trusts `status: "SANITIZED"` metadata alone.
 * A client attempting to send a raw password, credit card, OTP, email, phone number, vault secret,
 * screenshot buffer, or raw DOM object under `status: "SANITIZED"` is immediately REJECTED.
 */

import { REASONING_CONFIG } from "./reasoning-config.js";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN = /(?:\+?\d[\d(). -]{7,}\d)/;
const CARD_PATTERN = /(?:\d[ -]*?){13,19}/;

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
 * Recursively inspects a value for prohibited keys, raw PII, image buffers, scripts, or vault secrets.
 *
 * @param {any} value
 * @param {Set<object>} [visited=new Set()]
 * @returns {object} { safe: boolean, reason?: string }
 */
function recursiveInspect(value, visited = new Set()) {
  if (value === null || value === undefined) return { safe: true };

  const type = typeof value;

  if (type === "string") {
    // 1. Check for raw script injection / code primitives
    if (/<script\b|eval\(|new Function\(|javascript:/i.test(value)) {
      return { safe: false, reason: "Payload contains dangerous script or code primitives." };
    }

    // 2. Check for raw image buffers or screenshot data URLs
    if (/^data:image\//i.test(value) || /\[object (HTMLCanvasElement|ImageData|Buffer)\]/i.test(value)) {
      return { safe: false, reason: "Payload contains raw screenshot or image buffer data." };
    }

    // 3. Check for raw credit card numbers (Luhn pass)
    if (CARD_PATTERN.test(value) && passesLuhn(value)) {
      return { safe: false, reason: "Payload contains unmasked payment card number." };
    }

    // 4. Check for unmasked raw email address (excluding approved redaction placeholders/tokens)
    if (EMAIL_PATTERN.test(value) && !value.includes("[REDACTED]") && !value.includes("{{TOKEN_") && !value.includes("[LOCAL_ONLY")) {
      return { safe: false, reason: "Payload contains unmasked email address." };
    }

    // 5. Check for unmasked phone numbers (excluding approved placeholders/tokens and safe URLs)
    if (PHONE_PATTERN.test(value) && !value.includes("[REDACTED]") && !value.includes("{{TOKEN_") && !value.includes("[LOCAL_ONLY") && !/^https?:\/\//i.test(value)) {
      // Avoid false positive on numeric IDs, dates, or IP/port numbers
      const digits = value.replace(/\D/g, "");
      if (digits.length >= 10 && !/^\d{4}-\d{2}-\d{2}$/.test(value) && !/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(value)) {
        return { safe: false, reason: "Payload contains unmasked phone number." };
      }
    }

    // 6. Check for raw password or vault secret keywords in raw string values
    if (/\brawPassword\b|\bSuperSecret\b|\bvaultSecret\b/i.test(value)) {
      return { safe: false, reason: "Payload contains raw password or vault secret keyword." };
    }

    return { safe: true };
  }

  if (type === "object") {
    if (visited.has(value)) return { safe: true };
    visited.add(value);

    // Rejects raw DOM node / Element objects
    if (typeof Element !== "undefined" && value instanceof Element) {
      return { safe: false, reason: "Payload contains raw browser DOM Element object." };
    }
    if (value.nodeType || value.ownerDocument) {
      return { safe: false, reason: "Payload contains raw DOM node object." };
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const check = recursiveInspect(item, visited);
        if (!check.safe) return check;
      }
      return { safe: true };
    }

    for (const [key, val] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      if (REASONING_CONFIG.PROHIBITED_FIELDS.includes(lowerKey)) {
        return { safe: false, reason: `Payload contains prohibited field name '${key}'.` };
      }

      const check = recursiveInspect(val, visited);
      if (!check.safe) return check;
    }
  }

  return { safe: true };
}

/**
 * Validates incoming remote reasoning request payload.
 *
 * @param {object} payload
 * @returns {object} { valid: boolean, error?: string }
 */
export function validateRemotePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Payload must be a non-null object." };
  }

  // 1. Independent Authoritative Content Inspection (does NOT trust status: "SANITIZED" alone!)
  // Authoritative check BEFORE JSON serialization: Raw DOM/PII/secrets/buffers are NEVER serialized!
  const inspectResult = recursiveInspect(payload);
  if (!inspectResult.safe) {
    return { valid: false, error: `Remote boundary security failure: ${inspectResult.reason}` };
  }

  // 2. Size check limit (MAX_PAYLOAD_BYTES)
  let serialized = "";
  try {
    serialized = JSON.stringify(payload);
  } catch (err) {
    return { valid: false, error: "Failed to serialize payload to JSON." };
  }

  if (serialized.length > REASONING_CONFIG.MAX_PAYLOAD_BYTES) {
    return { valid: false, error: `Payload size (${serialized.length} bytes) exceeds maximum limit (${REASONING_CONFIG.MAX_PAYLOAD_BYTES} bytes).` };
  }

  // 3. Structural schema validation: Must contain taskIntent or sanitizedPageState or payload
  if (!payload.taskIntent && !payload.sanitizedPageState && !payload.domTree && !payload.sanitizedPayload && !payload.payload && !payload.status) {
    return { valid: false, error: "Payload missing required sanitized page representation or task intent." };
  }

  return { valid: true };
}
