/**
 * GLiNER Local Inference Configuration & Taxonomy Mapping Module.
 * Defines model metadata, target labels, confidence thresholds, and PII category mappings.
 */

import { PiiCategory } from "./config.js";

export const GLINER_MODEL_METADATA = Object.freeze({
  MODEL_NAME: "gliner_small-v2.1",
  MODEL_REPOSITORY: "onnx-community/gliner_small-v2.1",
  MODEL_SIZE: "~150MB FP32 / ~40MB INT8 quantized ONNX",
  LICENSE: "Apache-2.0",
  DEFAULT_PROVIDER: "wasm",
  SUPPORTED_PROVIDERS: Object.freeze(["webgpu", "wasm", "cpu", "mock_test"]),
  LOCAL_MODEL_PATH: "models/gliner-small/"
});

export const GLINER_TARGET_LABELS = Object.freeze([
  "person",
  "name",
  "address",
  "location",
  "organization",
  "company",
  "passport",
  "national_id"
]);

/**
 * Normalized taxonomy mapping from GLiNER semantic entity labels
 * to our project's standardized PII categories.
 */
export const GLINER_TAXONOMY_MAP = Object.freeze({
  person: PiiCategory.PERSON_NAME,
  name: PiiCategory.PERSON_NAME,
  human: PiiCategory.PERSON_NAME,
  "person name": PiiCategory.PERSON_NAME,
  "first name": PiiCategory.PERSON_NAME,
  "last name": PiiCategory.PERSON_NAME,

  address: PiiCategory.ADDRESS,
  location: PiiCategory.ADDRESS,
  "street address": PiiCategory.ADDRESS,
  street_address: PiiCategory.ADDRESS,
  city: PiiCategory.ADDRESS,
  "postal code": PiiCategory.ADDRESS,
  zipcode: PiiCategory.ADDRESS,

  organization: "organization",
  company: "organization",
  org: "organization",

  passport: PiiCategory.ACCOUNT_IDENTIFIER,
  "passport number": PiiCategory.ACCOUNT_IDENTIFIER,
  national_id: PiiCategory.ACCOUNT_IDENTIFIER,
  "id number": PiiCategory.ACCOUNT_IDENTIFIER,
  ssn: PiiCategory.ACCOUNT_IDENTIFIER
});

export const GLINER_CONFIG = Object.freeze({
  DEFAULT_CONFIDENCE_THRESHOLD: 0.50,
  MIN_THRESHOLD: 0.10,
  MAX_THRESHOLD: 0.95,
  MAX_CHUNK_CHARS: 512,
  MAX_SPANS_PER_CHUNK: 64,
  MAX_BATCH_SIZE: 32,
  OVERLAP_IOU_THRESHOLD: 0.50
});
