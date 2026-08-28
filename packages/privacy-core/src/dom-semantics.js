/**
 * Analyzes DOM element metadata (attributes, ARIA labels, associated <label> text)
 * to detect semantic PII categories without inspecting raw user-entered values.
 */
import { PiiCategory, EVIDENCE_GROUPS } from "./config.js";

/**
 * Extracts semantic descriptors from element attributes and labels.
 *
 * @param {object} fieldDescriptor
 * @param {string} [fieldDescriptor.type]
 * @param {string} [fieldDescriptor.autocomplete]
 * @param {string} [fieldDescriptor.name]
 * @param {string} [fieldDescriptor.id]
 * @param {string} [fieldDescriptor.placeholder]
 * @param {string} [fieldDescriptor.ariaLabel]
 * @param {string} [fieldDescriptor.labelText]
 * @returns {{ category: string, evidenceGroup: string, confidenceBoost: number, attributeMatched: string } | null}
 */
export function analyzeDomElementSemantics(fieldDescriptor) {
  if (!fieldDescriptor) return null;

  const {
    type = "",
    autocomplete = "",
    name = "",
    id = "",
    placeholder = "",
    ariaLabel = "",
    labelText = ""
  } = fieldDescriptor;

  const combined = [type, autocomplete, name, id, placeholder, ariaLabel, labelText]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const normalized = combined
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._-]/g, " ")
    .toLowerCase();

  // 1. Password Category
  if (type === "password" || /password|current\s*password|new\s*password/.test(normalized)) {
    return {
      category: PiiCategory.PASSWORD_FIELD,
      evidenceGroup: EVIDENCE_GROUPS.DOM_SEMANTIC,
      attributeMatched: "password-descriptor"
    };
  }

  // 2. Email Category
  if (type === "email" || /email|e\s*mail|mail\s*address/.test(normalized)) {
    return {
      category: PiiCategory.EMAIL,
      evidenceGroup: EVIDENCE_GROUPS.DOM_SEMANTIC,
      attributeMatched: "email-descriptor"
    };
  }

  // 3. Credit Card Category
  if (/cc\s*number|card\s*number|credit\s*card|cardholder|cvv|cvc|expir/.test(normalized)) {
    return {
      category: PiiCategory.PAYMENT_CARD,
      evidenceGroup: EVIDENCE_GROUPS.DOM_SEMANTIC,
      attributeMatched: "payment-card-descriptor"
    };
  }

  // 4. Phone Category
  if (type === "tel" || /phone|tel|mobile|cellphone|contact\s*number/.test(normalized)) {
    return {
      category: PiiCategory.PHONE,
      evidenceGroup: EVIDENCE_GROUPS.DOM_SEMANTIC,
      attributeMatched: "phone-descriptor"
    };
  }

  // 5. OTP / Verification Code Category
  if (/one\s*time\s*code|otp|verification\s*code|2fa|passcode|security\s*code/.test(normalized)) {
    return {
      category: PiiCategory.OTP,
      evidenceGroup: EVIDENCE_GROUPS.DOM_SEMANTIC,
      attributeMatched: "otp-descriptor"
    };
  }

  // 6. Person Name Category
  if (/given\s*name|family\s*name|full\s*name|first\s*name|last\s*name|author\s*name|customer\s*name/.test(normalized) ||
      (autocomplete && /name/.test(autocomplete))) {
    return {
      category: PiiCategory.PERSON_NAME,
      evidenceGroup: EVIDENCE_GROUPS.DOM_SEMANTIC,
      attributeMatched: "person-name-descriptor"
    };
  }

  // 7. Address Category
  if (/street\s*address|address\s*line|postal\s*code|zip\s*code|billing\s*address|shipping\s*address|pincode/.test(normalized)) {
    return {
      category: PiiCategory.ADDRESS,
      evidenceGroup: EVIDENCE_GROUPS.DOM_SEMANTIC,
      attributeMatched: "address-descriptor"
    };
  }

  // 8. Account Identifier Category
  if (/account\s*(id|number|num|ref)|customer\s*id|member\s*id|iban/.test(normalized)) {
    return {
      category: PiiCategory.ACCOUNT_IDENTIFIER,
      evidenceGroup: EVIDENCE_GROUPS.DOM_SEMANTIC,
      attributeMatched: "account-id-descriptor"
    };
  }

  return null;
}
