/**
 * Secure Communication Client & Transport Abstraction (Step 16).
 * Establishes the controlled, privacy-preserving transport boundary between
 * the local browser agent (Step 11 Sanitizer) and the remote reasoning service (Step 15 Backend).
 *
 * Privacy & Security Guarantees:
 * 1. Sanitization Before Serialization: Runs payload-validator BEFORE JSON serialization.
 *    Raw DOM, raw PII, screenshots, OCR buffers, or vault secrets are NEVER serialized or transmitted.
 * 2. UTF-8 Byte Length Validation: Validates serialized byte size using Buffer.byteLength(str, "utf8").
 * 3. HTTPS Protocol Enforcement: Remote endpoints must use HTTPS. Insecure HTTP or javascript: URLs are rejected.
 * 4. Stale Request / Replay Protection: Rejects stale timestamps exceeding MAX_CLOCK_SKEW_MS (5 min).
 * 5. Non-Sensitive Opaque Correlation ID: Correlation IDs contain zero PII or user identity.
 * 6. Zero Body / Credential Logging: Logs contain ONLY metadata (status, correlationId, executionTimeMs).
 *    Request bodies, response bodies, and auth tokens are NEVER logged into plaintext outputs.
 * 7. Strict Error Retry Classification: Retries ONLY transient transport errors (408, 429, 500, 502, 503, 504, timeout).
 *    NEVER retries 400, 401, 403, 422, PII scan failures, or authentication errors.
 * 8. Step 14 Execution Authority: Routes action proposals to Step 14 BrowserActionEngine.
 *    Step 16 NEVER executes browser actions directly.
 */

import {
  SECURE_COMMUNICATION_STATUS,
  SECURE_TRANSPORT_TYPES,
  AUTHENTICATION_STATUS
} from "../../../packages/shared-types/src/privacy-contracts.js";
import { SECURE_COMM_CONFIG, SECURE_COMM_VERSION } from "./secure-communication-config.js";
import { AuthenticationProvider, authenticationProvider } from "./authentication-provider.js";

/**
 * Calculates the UTF-8 byte length of a string in a browser-safe and Node-safe manner.
 *
 * @param {string} str
 * @returns {number}
 */
export function getUtf8ByteLength(str) {
  if (typeof str !== "string") return 0;
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str).length;
  }
  if (typeof Buffer !== "undefined" && typeof Buffer.byteLength === "function") {
    return Buffer.byteLength(str, "utf8");
  }
  if (typeof Blob !== "undefined") {
    return new Blob([str]).size;
  }
  return encodeURI(str).split(/%(?:u[0-9A-F]{4}|[0-9A-F]{2})/i).length - 1;
}

import { validateRemotePayload } from "../../../services/reasoning-backend/src/payload-validator.js";
import { validateReasoningResponse } from "../../../services/reasoning-backend/src/response-validator.js";
import { reasoningService } from "../../../services/reasoning-backend/src/reasoning-service.js";
import { OpenRouterProvider, GroqProvider } from "../../../services/reasoning-backend/src/model-provider.js";

/**
 * Mock Transport for Node.js automated testing.
 * Routes Step 11 sanitized payloads to Step 15 ReasoningService locally without external network I/O.
 */
export class MockTestTransport {
  constructor() {
    this.transportType = SECURE_TRANSPORT_TYPES.MOCK_TEST_TRANSPORT;
  }

  async sendRequest(requestEnvelope) {
    const { correlationId, timestamp, sanitizedPayload } = requestEnvelope;
    const response = await reasoningService.processReasoningRequest(sanitizedPayload);

    return {
      ok: response.ok,
      status: response.status || 200,
      statusCode: response.ok ? 200 : 400,
      recommendedActions: response.recommendedActions || [],
      reasoningSummary: response.reasoningSummary || "",
      metadata: {
        transportType: this.transportType,
        correlationId,
        timestamp: Date.now()
      }
    };
  }
}

/**
 * OpenRouter Transport for agent reasoning via OpenRouter API (Gemma 4 26B A4B).
 * Transmits Step 11 sanitized payloads to OpenRouter using OpenAI-compatible completion format.
 */
export class OpenRouterTransport {
  constructor(config = {}) {
    this.transportType = SECURE_TRANSPORT_TYPES.OPENROUTER_TRANSPORT;
    this.provider = config.provider || new OpenRouterProvider(config);
  }

  async sendRequest(requestEnvelope, options = {}) {
    const { correlationId, timestamp, sanitizedPayload } = requestEnvelope;
    const response = await this.provider.processRequest(sanitizedPayload, options);

    return {
      ok: response.ok,
      status: response.status || (response.ok ? 200 : 400),
      statusCode: response.ok ? 200 : 400,
      error: response.error,
      recommendedActions: response.recommendedActions || [],
      reasoningSummary: response.reasoningSummary || "",
      metadata: {
        transportType: this.transportType,
        providerType: this.provider.providerType,
        correlationId,
        timestamp: Date.now()
      }
    };
  }
}

/**
 * Groq Transport for ultra-low latency agent reasoning via Groq Cloud API (e.g. openai/gpt-oss-20b).
 * Transmits Step 11 sanitized payloads to Groq API using OpenAI-compatible completion format.
 */
export class GroqTransport {
  constructor(config = {}) {
    this.transportType = SECURE_TRANSPORT_TYPES.GROQ_TRANSPORT;
    this.provider = config.provider || new GroqProvider(config);
  }

  async sendRequest(requestEnvelope, options = {}) {
    const { correlationId, timestamp, sanitizedPayload } = requestEnvelope;
    const response = await this.provider.processRequest(sanitizedPayload, options);

    return {
      ok: response.ok,
      status: response.status || (response.ok ? 200 : 400),
      statusCode: response.ok ? 200 : 400,
      error: response.error,
      recommendedActions: response.recommendedActions || [],
      reasoningSummary: response.reasoningSummary || "",
      metadata: {
        transportType: this.transportType,
        providerType: this.provider.providerType,
        correlationId,
        timestamp: Date.now()
      }
    };
  }
}


/**
 * Modular Secure Communication Client Class
 */
export class SecureCommunicationClient {
  constructor(customConfig = {}) {
    this.config = { ...SECURE_COMM_CONFIG, ...customConfig };
    this.status = SECURE_COMMUNICATION_STATUS.UNINITIALIZED;
    this.authProvider = customConfig.authProvider || authenticationProvider;
    this.transport = customConfig.transport || new MockTestTransport();
    this.endpointUrl = customConfig.endpointUrl || null;
    this.expectedOrigin = customConfig.expectedOrigin || null;
    this.lastProcessedAt = null;
  }

  /**
   * Initializes the secure communication client.
   *
   * @param {object} [customConfig={}]
   * @returns {object} Initialization status
   */
  initialize(customConfig = {}) {
    try {
      this.config = { ...this.config, ...customConfig };
      if (customConfig.authProvider) this.authProvider = customConfig.authProvider;
      if (customConfig.transport) this.transport = customConfig.transport;
      if (customConfig.endpointUrl) this.endpointUrl = customConfig.endpointUrl;
      if (customConfig.expectedOrigin) this.expectedOrigin = customConfig.expectedOrigin;

      this.status = SECURE_COMMUNICATION_STATUS.READY;

      return Object.freeze({
        ok: true,
        state: this.status,
        version: SECURE_COMM_VERSION,
        transportType: this.transport?.transportType || SECURE_TRANSPORT_TYPES.MOCK_TEST_TRANSPORT
      });
    } catch (err) {
      this.status = SECURE_COMMUNICATION_STATUS.ERROR;
      return Object.freeze({
        ok: false,
        error: "Secure communication client initialization failed.",
        state: this.status
      });
    }
  }

  /**
   * Returns current client status state.
   *
   * @returns {string}
   */
  getClientStatus() {
    return this.status;
  }

  /**
   * Generates an opaque, non-sensitive request correlation ID (zero PII / user identity).
   *
   * @returns {string}
   */
  generateCorrelationId() {
    const randomSuffix = Math.random().toString(36).substring(2, 12);
    return `req_corr_${Date.now()}_${randomSuffix}`;
  }

  /**
   * Validates remote endpoint URL protocol and origin security.
   *
   * @param {string} urlString
   * @returns {object} { valid: boolean, error?: string }
   */
  validateEndpoint(urlString) {
    if (!urlString || typeof urlString !== "string") {
      return { valid: false, error: "Endpoint URL must be a non-empty string." };
    }

    const lowerUrl = urlString.trim().toLowerCase();
    for (const forbidden of this.config.FORBIDDEN_PROTOCOLS) {
      if (lowerUrl.startsWith(forbidden)) {
        return { valid: false, error: `Forbidden protocol scheme '${forbidden}' in endpoint URL.` };
      }
    }

    try {
      const parsed = new URL(urlString);
      if (!this.config.PERMITTED_REMOTE_PROTOCOLS.includes(parsed.protocol)) {
        return { valid: false, error: `Insecure protocol '${parsed.protocol}' in endpoint URL. HTTPS required.` };
      }

      if (this.expectedOrigin && parsed.origin !== this.expectedOrigin) {
        return { valid: false, error: `Response origin mismatch: Endpoint '${parsed.origin}' does not match expected origin '${this.expectedOrigin}'.` };
      }

      return { valid: true, origin: parsed.origin };
    } catch (err) {
      return { valid: false, error: "Invalid endpoint URL syntax." };
    }
  }

  /**
   * Transmits a Step 11 sanitized context payload over secure transport.
   *
   * @param {object} sanitizedPayload
   * @param {object} [options={}]
   * @returns {Promise<object>} Sanitized reasoning response metadata and action proposals
   */
  async sendSanitizedPayload(sanitizedPayload, options = {}) {
    const startTime = Date.now();

    // 1. Lifecycle check
    if (this.status !== SECURE_COMMUNICATION_STATUS.READY) {
      return Object.freeze({
        ok: false,
        status: SECURE_COMMUNICATION_STATUS.ERROR,
        error: `Client is in '${this.status}' state. Must be initialized before transmitting payloads.`
      });
    }

    // 2. PRE-SERIALIZATION SANITIZATION VALIDATION
    // Authoritative check BEFORE JSON serialization: Raw DOM/PII/secrets/buffers are NEVER serialized or transmitted!
    const preValidation = validateRemotePayload(sanitizedPayload);
    if (!preValidation.valid) {
      return Object.freeze({
        ok: false,
        status: SECURE_COMMUNICATION_STATUS.DENIED,
        error: preValidation.error
      });
    }

    // 3. STALE REQUEST & TIMEOUT PROTECTION
    const timestamp = Number(options.timestamp) || Date.now();
    const clockSkew = Math.abs(Date.now() - timestamp);
    if (clockSkew > this.config.MAX_CLOCK_SKEW_MS) {
      return Object.freeze({
        ok: false,
        status: "DENIED_STALE_REQUEST",
        error: `Request timestamp is stale or skewed (${clockSkew} ms exceeds limit ${this.config.MAX_CLOCK_SKEW_MS} ms).`
      });
    }

    // 4. ENDPOINT PROTOCOL VALIDATION (For remote transport mode)
    const activeEndpoint = options.endpointUrl || this.endpointUrl;
    if (activeEndpoint) {
      const endpointValidation = this.validateEndpoint(activeEndpoint);
      if (!endpointValidation.valid) {
        return Object.freeze({
          ok: false,
          status: "DENIED_INSECURE_ENDPOINT",
          error: endpointValidation.error
        });
      }
    }

    const correlationId = this.generateCorrelationId();

    // 5. JSON SERIALIZATION & UTF-8 BYTE SIZE VALIDATION
    const requestEnvelope = {
      correlationId,
      timestamp,
      sanitizedPayload,
      metadata: { version: SECURE_COMM_VERSION }
    };

    let serializedJson = "";
    try {
      serializedJson = JSON.stringify(requestEnvelope);
    } catch (err) {
      return Object.freeze({
        ok: false,
        status: SECURE_COMMUNICATION_STATUS.ERROR,
        error: "Failed to serialize request envelope to JSON."
      });
    }

    const requestByteSize = getUtf8ByteLength(serializedJson);
    if (requestByteSize > this.config.MAX_REQUEST_SIZE_BYTES) {
      return Object.freeze({
        ok: false,
        status: SECURE_COMMUNICATION_STATUS.DENIED,
        error: `Request byte size (${requestByteSize} bytes) exceeds limit (${this.config.MAX_REQUEST_SIZE_BYTES} bytes).`
      });
    }

    // 6. RUNTIME AUTHENTICATION INJECTION (Credentials injected dynamically; never logged)
    const authHeaders = this.authProvider.getAuthHeader();

    // 7. BOUNDED RETRIES WITH STRICT ERROR CLASSIFICATION
    let lastError = null;
    let transportResult = null;
    const maxRetries = Math.min(this.config.MAX_RETRIES, Number(options.maxRetries ?? this.config.MAX_RETRIES));

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        this.status = SECURE_COMMUNICATION_STATUS.TRANSMITTING;

        const timeoutMs = Number(options.timeoutMs ?? this.config.REQUEST_TIMEOUT_MS);
        transportResult = await Promise.race([
          this.transport.sendRequest(requestEnvelope, { headers: authHeaders, endpointUrl: activeEndpoint, timeoutMs }),
          new Promise((_, reject) => setTimeout(() => {
            const timeoutErr = new Error("Transport request timeout.");
            timeoutErr.statusCode = 408; // 408 Request Timeout is retryable
            reject(timeoutErr);
          }, timeoutMs))
        ]);

        if (transportResult && (transportResult.ok || transportResult.statusCode === 200)) {
          break; // Success!
        }

        const statusCode = Number(transportResult?.statusCode || 500);
        const errorMessage = transportResult?.error || `Transport status code '${statusCode}'.`;

        // NEVER retry non-retryable status codes (400, 401, 403, 422) or security errors
        if (this.config.NON_RETRYABLE_STATUS_CODES.includes(statusCode)) {
          lastError = new Error(errorMessage);
          break;
        }

        // Retry transient errors (408, 429, 500, 502, 503, 504)
        if (this.config.RETRYABLE_STATUS_CODES.includes(statusCode) && attempt < maxRetries) {
          await new Promise((resolveDelay) => setTimeout(resolveDelay, this.config.RETRY_DELAY_MS));
          continue;
        }

        lastError = new Error(errorMessage);
        break;
      } catch (err) {
        const isTimeout = err.message?.includes("timeout") || err.statusCode === 408;
        if (isTimeout && attempt < maxRetries) {
          await new Promise((resolveDelay) => setTimeout(resolveDelay, this.config.RETRY_DELAY_MS));
          continue;
        }

        lastError = err;
        break; // Non-transient error; stop retry
      }
    }

    this.status = SECURE_COMMUNICATION_STATUS.READY;

    if (!transportResult || !transportResult.ok) {
      return Object.freeze({
        ok: false,
        status: SECURE_COMMUNICATION_STATUS.ERROR,
        error: lastError?.message || transportResult?.error || "Secure transport request failed."
      });
    }

    // 8. RESPONSE SIZE & RESPONSE CONTENT SECURITY VALIDATION
    const responseJson = JSON.stringify(transportResult);
    const responseByteSize = getUtf8ByteLength(responseJson);

    if (responseByteSize > this.config.MAX_RESPONSE_SIZE_BYTES) {
      return Object.freeze({
        ok: false,
        status: SECURE_COMMUNICATION_STATUS.DENIED,
        error: `Response byte size (${responseByteSize} bytes) exceeds maximum limit (${this.config.MAX_RESPONSE_SIZE_BYTES} bytes).`
      });
    }

    const responseValidation = validateReasoningResponse(transportResult);
    if (!responseValidation.valid) {
      return Object.freeze({
        ok: false,
        status: SECURE_COMMUNICATION_STATUS.DENIED,
        error: responseValidation.error
      });
    }

    const executionTimeMs = Date.now() - startTime;
    this.lastProcessedAt = Date.now();

    // 9. ZERO BODY / CREDENTIAL LOGGING METADATA
    // Return sanitized metadata object only. Payload contents and auth tokens are NEVER logged into result objects.
    return Object.freeze({
      ok: true,
      status: SECURE_COMMUNICATION_STATUS.COMPLETED,
      recommendedActions: Object.freeze(transportResult.recommendedActions || []),
      reasoningSummary: transportResult.reasoningSummary || "",
      metadata: Object.freeze({
        correlationId,
        executionTimeMs,
        transportType: this.transport?.transportType || SECURE_TRANSPORT_TYPES.MOCK_TEST_TRANSPORT
      })
    });
  }

  /**
   * Disposes of secure communication client state.
   *
   * @returns {object}
   */
  dispose() {
    this.status = SECURE_COMMUNICATION_STATUS.DISPOSED;
    this.authProvider = null;
    this.transport = null;
    this.endpointUrl = null;
    this.expectedOrigin = null;
    this.lastProcessedAt = null;
    return Object.freeze({
      ok: true,
      state: this.status
    });
  }
}

/**
 * Factory function for creating an isolated SecureCommunicationClient instance.
 *
 * @param {object} [config={}]
 * @returns {SecureCommunicationClient}
 */
export function createSecureCommunicationClient(config = {}) {
  const client = new SecureCommunicationClient(config);
  client.initialize(config);
  return client;
}

// Default singleton instance
export const secureCommunicationClient = createSecureCommunicationClient();
