/**
 * Centralized Configuration for Remote Reasoning Backend Service (Step 15).
 * Defines remote boundary limits, timeout thresholds, and prohibited field rules.
 */

import { REASONING_PROVIDER_TYPES } from "../../../packages/shared-types/src/privacy-contracts.js";

export const REASONING_SERVICE_VERSION = "1.0.0";

export const REASONING_CONFIG = Object.freeze({
  REASONING_SERVICE_VERSION: "1.0.0",
  DEFAULT_PROVIDER: REASONING_PROVIDER_TYPES.MOCK_TEST,
  REQUEST_TIMEOUT_MS: 5000,
  MAX_PAYLOAD_BYTES: 250000,
  MAX_RECOMMENDED_ACTIONS: 10,
  ALLOW_RAW_SECRETS: false,
  FAIL_CLOSED_ON_PII: true,

  PROHIBITED_FIELDS: Object.freeze([
    "password",
    "rawpassword",
    "otp",
    "rawotp",
    "creditcard",
    "rawcard",
    "secretvalue",
    "vaultsecret",
    "vaultcontents",
    "cookie",
    "cookies",
    "header",
    "headers",
    "authtoken",
    "authorizationtoken"
  ])
});

export const OPENROUTER_CONFIG = Object.freeze({
  PROVIDER_NAME: "openrouter",
  DEFAULT_MODEL: "google/gemma-4-26b-a4b",
  API_URL: "https://openrouter.ai/api/v1/chat/completions",
  REQUEST_TIMEOUT_MS: 30000,
  DEFAULT_TEMPERATURE: 0.1,
  MAX_TOKENS: 1024
});

export const GROQ_CONFIG = Object.freeze({
  PROVIDER_NAME: "groq",
  DEFAULT_MODEL: "openai/gpt-oss-20b",
  API_URL: "https://api.groq.com/openai/v1/chat/completions",
  REQUEST_TIMEOUT_MS: 20000,
  DEFAULT_TEMPERATURE: 0.1,
  MAX_TOKENS: 1024
});

