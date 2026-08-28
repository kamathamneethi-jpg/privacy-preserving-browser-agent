/**
 * Centralized Configuration for Sanitized Page State & Remote Reasoning Context Builder (Step 11).
 * Defines limits, stripped HTML elements/attributes, token templates, and safety parameters.
 */

export const CONTEXT_BUILDER_VERSION = "1.0.0";

export const SANITIZER_CONFIG = Object.freeze({
  CONTEXT_BUILDER_VERSION: "1.0.0",
  MAX_DOM_DEPTH: 32,
  MAX_NODES_PER_PAYLOAD: 1000,
  MAX_TEXT_LENGTH: 5000,
  MAX_PAYLOAD_BYTES: 524288, // 512 KB maximum payload size

  STRIPPED_HTML_TAGS: Object.freeze([
    "script",
    "style",
    "noscript",
    "iframe",
    "object",
    "embed",
    "applet",
    "base"
  ]),

  STRIPPED_ATTRIBUTES: Object.freeze([
    "onclick",
    "onload",
    "onerror",
    "onmouseover",
    "onfocus",
    "onblur",
    "onchange",
    "onsubmit",
    "data-raw-value",
    "data-secret",
    "data-password"
  ]),

  ALLOWED_NODE_TYPES: Object.freeze([
    "element",
    "text",
    "root"
  ]),

  TOKEN_PREFIX: "TOKEN_",
  DEFAULT_REDACTION_TEXT: "[REDACTED]"
});
