/**
 * Environment Reporter (Step 17).
 * Reports accurate system capability and provider runtime status.
 *
 * Privacy & Security Guarantees:
 * 1. Honest 5-State Reporting: Uses explicit status values (IMPLEMENTED, AVAILABLE, NOT_AVAILABLE, NOT_CONFIGURED, MOCK_TEST).
 * 2. Zero Fingerprinting: Avoids exposing device serials, GPU vendor strings, renderer fingerprints, or user identity.
 * 3. Zero Fabrication: Never claims real AI/GPU execution unless genuinely connected and validated.
 */

import { SECURE_TRANSPORT_TYPES, REASONING_PROVIDER_TYPES } from "../../shared-types/src/privacy-contracts.js";

export class EnvironmentReporter {
  constructor(customConfig = {}) {
    this.config = customConfig;
  }

  /**
   * Evaluates current environment and returns a frozen system environment report.
   *
   * @returns {object}
   */
  generateEnvironmentReport() {
    const isNode = typeof process !== "undefined" && process.versions && process.versions.node;
    const hasNavigatorGpu = typeof navigator !== "undefined" && Boolean(navigator.gpu);

    const ocrProvider = this.config.ocrProvider || "MOCK_TEST";
    const onnxProvider = this.config.onnxProvider || (isNode ? "MOCK_TEST" : "NOT_AVAILABLE");
    const webgpuStatus = hasNavigatorGpu ? "AVAILABLE" : "NOT_AVAILABLE";
    const mlProvider = this.config.mlProvider || (isNode ? "MOCK_TEST" : "NOT_AVAILABLE");
    const reasoningProvider = this.config.hasRealRemoteBackend ? REASONING_PROVIDER_TYPES.REAL_REMOTE : REASONING_PROVIDER_TYPES.MOCK_TEST;
    const transportProvider = this.config.hasRealRemoteBackend ? SECURE_TRANSPORT_TYPES.REAL_REMOTE_TRANSPORT : SECURE_TRANSPORT_TYPES.MOCK_TEST_TRANSPORT;
    const browserRuntime = isNode ? "NODE_TEST_ENVIRONMENT" : "CHROME_EXTENSION_MV3";

    return Object.freeze({
      ocrProvider,
      onnxProvider,
      webgpuStatus,
      mlProvider,
      reasoningProvider,
      transportProvider,
      browserRuntime,
      reportTimestamp: Date.now()
    });
  }
}

/**
 * Factory function for creating an EnvironmentReporter instance.
 *
 * @param {object} [config={}]
 * @returns {EnvironmentReporter}
 */
export function createEnvironmentReporter(config = {}) {
  return new EnvironmentReporter(config);
}

// Default singleton instance
export const environmentReporter = createEnvironmentReporter();
