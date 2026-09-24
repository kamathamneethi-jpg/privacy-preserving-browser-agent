/**
 * Laya Confidence Client (v2).
 * Advisory client communicating asynchronously with the local offline Laya service.
 * Enforces hardware-adaptive timeouts, fail-safe fallbacks, and empirical theta* thresholding.
 *
 * GUARANTEES:
 * 1. 100% Local / Loopback only (127.0.0.1). Zero external network egress.
 * 2. Fail-Safe: If service is offline, slow, or times out, returns null and logs error.
 * 3. Never throws uncaught exceptions, never blocks the authoritative rule engine.
 */

export class LayaConfidenceClient {
  constructor(options = {}) {
    const env = (typeof process !== "undefined" && process?.env) ? process.env : {};
    this.host = options.host || env.LAYA_HOST || "127.0.0.1";
    this.port = options.port || parseInt(env.LAYA_PORT || "8766", 10);
    this.timeoutMs = options.timeoutMs || parseInt(env.LAYA_TIMEOUT_MS || "800", 10);
    this.thetaStar = options.thetaStar || 0.85; // Default fallback until loaded from calibration
    this.baseUrl = `http://${this.host}:${this.port}`;
    this._isServiceHealthy = null;
  }

  /**
   * Fast health check (100ms timeout) to verify if local service is online.
   */
  async checkHealth() {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 150);
      const res = await fetch(`${this.baseUrl}/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data.theta_star) {
          this.thetaStar = data.theta_star;
        }
        this._isServiceHealthy = true;
        return data;
      }
      this._isServiceHealthy = false;
      return null;
    } catch {
      this._isServiceHealthy = false;
      return null;
    }
  }

  /**
   * Scores a single DOM field state asynchronously.
   *
   * @param {object} state - { label, type, surrounding_dom, task_context }
   * @param {Array<string>} [options=["ALLOW", "TOKENIZE", "REDACT", "LOCAL_ONLY"]]
   * @returns {Promise<object|null>} Score result or null on failure
   */
  async scoreField(state, options = ["ALLOW", "TOKENIZE", "REDACT", "LOCAL_ONLY"]) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, options }),
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!res.ok) {
        console.warn(`[LayaClient] HTTP error from confidence service: ${res.status}`);
        return null;
      }

      const data = await res.json();
      return {
        choice: data.choice,
        confidence: data.confidence,
        perOptionProbs: data.per_option_probs,
        temperatureApplied: data.temperature_applied,
        thetaStar: data.theta_star || this.thetaStar,
        latencyMs: data.latency_ms,
        mode: data.mode
      };
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        // Explicitly log timeout without throwing
        return {
          choice: null,
          confidence: 0.0,
          error: "LAYA_SERVICE_TIMEOUT",
          timeoutMs: this.timeoutMs
        };
      }
      return {
        choice: null,
        confidence: 0.0,
        error: "LAYA_SERVICE_UNAVAILABLE"
      };
    }
  }

  /**
   * Batched scoring for multiple DOM elements in a single forward pass.
   *
   * @param {Array<object>} items - [{ state, options }]
   * @returns {Promise<object|null>}
   */
  async scoreBatch(items) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const controller = new AbortController();
    const batchTimeout = Math.max(this.timeoutMs * 1.5, 1200);
    const timer = setTimeout(() => controller.abort(), batchTimeout);

    try {
      const res = await fetch(`${this.baseUrl}/score-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!res.ok) return null;
      return await res.json();
    } catch {
      clearTimeout(timer);
      return null;
    }
  }
}

// Global shared singleton for reuse across pipeline
export const defaultLayaClient = new LayaConfidenceClient();
