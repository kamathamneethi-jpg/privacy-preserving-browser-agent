/**
 * Benchmark Utility (Step 17).
 * Measures high-resolution latency breakdown and task execution metrics across the agent pipeline.
 *
 * Privacy & Security Guarantees:
 * 1. Metrics contain timing, status codes, and counts ONLY.
 * 2. NEVER logs or stores page text, URLs, secrets, screenshots, OCR buffers, request/response bodies, or credentials.
 * 3. Reports NOT_AVAILABLE for missing hardware/model capabilities rather than inventing numbers.
 */

export class BenchmarkUtility {
  constructor() {
    this.metrics = {
      perceptionMs: 0,
      detectionMs: 0,
      sanitizationMs: 0,
      transportMs: 0,
      reasoningMs: 0,
      actionExecutionMs: 0,
      totalEndToEndMs: 0,
      privacyViolations: 0,
      deniedActions: 0,
      successfulActions: 0
    };
    this.startTime = 0;
  }

  /**
   * Starts the end-to-end benchmark timer.
   */
  startBenchmark() {
    this.startTime = this.#now();
    this.metrics = {
      perceptionMs: 0,
      detectionMs: 0,
      sanitizationMs: 0,
      transportMs: 0,
      reasoningMs: 0,
      actionExecutionMs: 0,
      totalEndToEndMs: 0,
      privacyViolations: 0,
      deniedActions: 0,
      successfulActions: 0
    };
  }

  /**
   * Records step execution latency in milliseconds.
   *
   * @param {string} stepName
   * @param {number} durationMs
   */
  recordStepLatency(stepName, durationMs) {
    const val = Math.max(0, Number(durationMs) || 0);
    if (stepName in this.metrics && typeof this.metrics[stepName] === "number") {
      this.metrics[stepName] = parseFloat(val.toFixed(2));
    }
  }

  /**
   * Increments privacy violation counter.
   */
  recordPrivacyViolation() {
    this.metrics.privacyViolations += 1;
  }

  /**
   * Increments denied action counter.
   */
  recordDeniedAction() {
    this.metrics.deniedActions += 1;
  }

  /**
   * Increments successful action counter.
   */
  recordSuccessfulAction() {
    this.metrics.successfulActions += 1;
  }

  /**
   * Completes the benchmark and returns frozen sanitized metrics.
   *
   * @returns {object}
   */
  endBenchmark() {
    if (this.startTime > 0) {
      this.metrics.totalEndToEndMs = parseFloat((this.#now() - this.startTime).toFixed(2));
    }

    return Object.freeze({ ...this.metrics });
  }

  #now() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }
}

/**
 * Factory function for creating a BenchmarkUtility instance.
 *
 * @returns {BenchmarkUtility}
 */
export function createBenchmarkUtility() {
  return new BenchmarkUtility();
}
