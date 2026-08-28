/**
 * Centralized Configuration for Browser-Agent Action System (Step 14).
 * Defines action bounds, timeout thresholds, permitted protocols, and target resolution priorities.
 */

import {
  BROWSER_ACTION_TYPES,
  PROCESSING_DESTINATIONS,
  ACTION_TARGET_TYPES
} from "../../shared-types/src/privacy-contracts.js";

export const ACTION_SYSTEM_VERSION = "1.0.0";

export const ACTION_CONFIG = Object.freeze({
  ACTION_SYSTEM_VERSION: "1.0.0",
  MAX_ACTIONS_PER_BATCH: 10,
  ACTION_TIMEOUT_MS: 5000,
  MAX_TEXT_LENGTH: 1000,
  MAX_SCROLL_DISTANCE: 5000,
  REQUIRE_EXPLICIT_AUTH_FOR_SENSITIVE: true,

  ALLOWED_ACTION_TYPES: Object.freeze([
    BROWSER_ACTION_TYPES.CLICK,
    BROWSER_ACTION_TYPES.TYPE,
    BROWSER_ACTION_TYPES.FILL,
    BROWSER_ACTION_TYPES.SELECT,
    BROWSER_ACTION_TYPES.SUBMIT,
    BROWSER_ACTION_TYPES.SCROLL,
    BROWSER_ACTION_TYPES.NAVIGATE,
    BROWSER_ACTION_TYPES.WAIT
  ]),

  LOCAL_DESTINATIONS: Object.freeze([
    PROCESSING_DESTINATIONS.LOCAL_BROWSER,
    PROCESSING_DESTINATIONS.LOCAL_EXTENSION
  ]),

  PERMITTED_PROTOCOLS: Object.freeze([
    "http:",
    "https:"
  ]),

  FORBIDDEN_PROTOCOLS: Object.freeze([
    "javascript:",
    "data:",
    "file:",
    "blob:",
    "about:"
  ]),

  TARGET_RESOLUTION_PRIORITY: Object.freeze([
    ACTION_TARGET_TYPES.TOKEN_REFERENCE,
    ACTION_TARGET_TYPES.SEMANTIC_TARGET,
    ACTION_TARGET_TYPES.DOM_ELEMENT,
    ACTION_TARGET_TYPES.OCR_REGION
  ])
});
