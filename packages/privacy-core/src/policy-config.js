/**
 * Centralized Policy Configuration Module for Step 8.
 * Defines policy version, category sensitivity classifications, destination restrictions,
 * baseline policy matrix, and confidence thresholds.
 */

import { SENSITIVITY_LEVELS, PROCESSING_DESTINATIONS, POLICY_ACTIONS } from "../../shared-types/src/privacy-contracts.js";
import { PiiCategory } from "./config.js";

export const POLICY_VERSION = "1.0.0";

export const PUBLIC_SAFE_CATEGORIES = Object.freeze([
  "product_title",
  "product",
  "price",
  "brand",
  "color",
  "specification",
  "public_label",
  "safe_context",
  "public_text"
]);

export const CATEGORY_SENSITIVITY_MAP = Object.freeze({
  [PiiCategory.PASSWORD_FIELD]: SENSITIVITY_LEVELS.CRITICAL,
  "password": SENSITIVITY_LEVELS.CRITICAL,
  [PiiCategory.OTP]: SENSITIVITY_LEVELS.CRITICAL,
  [PiiCategory.PAYMENT_CARD]: SENSITIVITY_LEVELS.CRITICAL,
  "credit_card": SENSITIVITY_LEVELS.CRITICAL,
  "payment_card_field": SENSITIVITY_LEVELS.CRITICAL,
  [PiiCategory.ADDRESS]: SENSITIVITY_LEVELS.HIGH,
  [PiiCategory.ACCOUNT_IDENTIFIER]: SENSITIVITY_LEVELS.HIGH,
  [PiiCategory.EMAIL]: SENSITIVITY_LEVELS.MEDIUM,
  [PiiCategory.EMAIL_FIELD]: SENSITIVITY_LEVELS.MEDIUM,
  [PiiCategory.PHONE]: SENSITIVITY_LEVELS.MEDIUM,
  [PiiCategory.PHONE_FIELD]: SENSITIVITY_LEVELS.MEDIUM,
  [PiiCategory.PERSON_NAME]: SENSITIVITY_LEVELS.MEDIUM,
  // Public & Safe non-PII categories
  "product_title": SENSITIVITY_LEVELS.LOW,
  "product": SENSITIVITY_LEVELS.LOW,
  "price": SENSITIVITY_LEVELS.LOW,
  "brand": SENSITIVITY_LEVELS.LOW,
  "color": SENSITIVITY_LEVELS.LOW,
  "specification": SENSITIVITY_LEVELS.LOW,
  "public_label": SENSITIVITY_LEVELS.LOW,
  "safe_context": SENSITIVITY_LEVELS.LOW,
  "public_text": SENSITIVITY_LEVELS.PUBLIC
});

export const DEFAULT_CATEGORY_ROLES = Object.freeze({
  [PiiCategory.EMAIL]: "account_identifier",
  [PiiCategory.EMAIL_FIELD]: "account_identifier",
  [PiiCategory.PHONE]: "account_identifier",
  [PiiCategory.PHONE_FIELD]: "account_identifier",
  [PiiCategory.PASSWORD_FIELD]: "authentication_secret",
  "password": "authentication_secret",
  [PiiCategory.OTP]: "authentication_secret",
  [PiiCategory.PAYMENT_CARD]: "billing_information",
  "credit_card": "billing_information",
  "payment_card_field": "billing_information",
  [PiiCategory.ADDRESS]: "shipping_information",
  [PiiCategory.ACCOUNT_IDENTIFIER]: "account_identifier",
  [PiiCategory.PERSON_NAME]: "account_identifier",
  "product_title": "public_product_attribute",
  "product": "public_product_attribute",
  "price": "public_product_attribute",
  "brand": "public_product_attribute",
  "color": "public_product_attribute",
  "specification": "public_product_attribute",
  "public_label": "contextual_reference",
  "safe_context": "contextual_reference",
  "public_text": "contextual_reference"
});

export const POLICY_CONFIG = Object.freeze({
  MIN_DETECTION_CONFIDENCE: 0.60,
  MIN_RELEVANCE_CONFIDENCE: 0.60,
  MIN_POLICY_CONFIDENCE: 0.70,

  // Categories eligible for tokenization when sent to remote destinations
  TOKENIZATION_ELIGIBLE_CATEGORIES: Object.freeze([
    PiiCategory.EMAIL,
    PiiCategory.EMAIL_FIELD,
    PiiCategory.PHONE,
    PiiCategory.PHONE_FIELD,
    PiiCategory.PERSON_NAME,
    PiiCategory.ADDRESS,
    PiiCategory.ACCOUNT_IDENTIFIER,
    PiiCategory.PAYMENT_CARD,
    "credit_card",
    "payment_card_field"
  ]),

  // Categories that must strictly remain LOCAL_ONLY or REDACT for local browser operations
  LOCAL_ONLY_CATEGORIES: Object.freeze([
    PiiCategory.PASSWORD_FIELD,
    "password",
    PiiCategory.OTP,
    PiiCategory.PAYMENT_CARD,
    "credit_card",
    "payment_card_field"
  ]),

  // Categories that must NEVER receive raw ALLOW for remote destinations
  REMOTE_ALLOW_FORBIDDEN_CATEGORIES: Object.freeze([
    PiiCategory.PASSWORD_FIELD,
    "password",
    PiiCategory.OTP,
    PiiCategory.PAYMENT_CARD,
    "credit_card",
    "payment_card_field",
    PiiCategory.ADDRESS,
    PiiCategory.ACCOUNT_IDENTIFIER,
    PiiCategory.EMAIL,
    PiiCategory.EMAIL_FIELD,
    PiiCategory.PHONE,
    PiiCategory.PHONE_FIELD,
    PiiCategory.PERSON_NAME
  ]),

  DEFAULT_SAFE_ACTION: POLICY_ACTIONS.REDACT
});
