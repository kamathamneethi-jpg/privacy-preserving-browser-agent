/**
 * WebGPU Capability Manager Module (Step 13).
 * Provides a modular, local-only WebGPU hardware detection and manager abstraction.
 *
 * Privacy & Security Guarantees:
 * 1. Executes 100% on-device. Zero network calls, cloud APIs, or external telemetry.
 * 2. Fingerprinting protection: Exposes only safe non-identifying capability limits
 *    (e.g., maxTextureDimension2D, supportedFeatures), omitting raw hardware vendor/device names.
 * 3. Fail-closed safety: Safely handles environments without WebGPU, Node.js contexts,
 *    or GPU adapter/device acquisition failures without throwing uncaught exceptions.
 */

import {
  WEBGPU_STATUS,
  GPU_BACKEND_CAPABILITIES
} from "../../shared-types/src/privacy-contracts.js";
import { WEBGPU_CONFIG, WEBGPU_VERSION } from "./webgpu-config.js";

/**
 * Modular WebGPU Capability Manager Class
 */
export class WebGpuManager {
  constructor(customConfig = {}) {
    this.config = { ...WEBGPU_CONFIG, ...customConfig };
    this.status = WEBGPU_STATUS.UNINITIALIZED;
    this.adapter = null;
    this.device = null;
    this.customGpuProvider = customConfig.customGpuProvider || null;
    this.lastError = null;
  }

  /**
   * Safely checks whether the current runtime environment exposes a WebGPU interface (`navigator.gpu`).
   *
   * @returns {boolean}
   */
  detectSupport() {
    try {
      if (this.customGpuProvider) {
        return true;
      }
      return typeof navigator !== "undefined" && Boolean(navigator && navigator.gpu);
    } catch (err) {
      return false;
    }
  }

  /**
   * Safely requests a GPU adapter from the runtime environment.
   *
   * @param {object} [options={}]
   * @returns {Promise<object|null>}
   */
  async requestAdapter(options = {}) {
    if (!this.detectSupport()) return null;

    try {
      if (this.customGpuProvider && typeof this.customGpuProvider.requestAdapter === "function") {
        return await this.customGpuProvider.requestAdapter(options);
      }

      const powerPreference = options.powerPreference || this.config.POWER_PREFERENCE;
      const adapterOptions = powerPreference !== "default" ? { powerPreference } : {};
      
      const adapter = await navigator.gpu.requestAdapter(adapterOptions);
      return adapter || null;
    } catch (err) {
      this.lastError = "GPU adapter acquisition rejected or failed.";
      return null;
    }
  }

  /**
   * Safely requests a GPU device from an acquired GPU adapter.
   *
   * @param {object} adapter
   * @param {object} [descriptor={}]
   * @returns {Promise<object|null>}
   */
  async requestDevice(adapter, descriptor = {}) {
    if (!adapter) return null;

    try {
      if (typeof adapter.requestDevice === "function") {
        const device = await adapter.requestDevice(descriptor);
        return device || null;
      }
      return null;
    } catch (err) {
      this.lastError = "GPU device creation failed.";
      return null;
    }
  }

  /**
   * Initializes the WebGPU manager lifecycle.
   *
   * @param {object} [customConfig={}]
   * @returns {Promise<object>} Initialization result { ok: boolean, state: string, available: boolean }
   */
  async initialize(customConfig = {}) {
    try {
      this.config = { ...this.config, ...customConfig };
      this.status = WEBGPU_STATUS.INITIALIZING;

      if (!this.detectSupport()) {
        this.status = WEBGPU_STATUS.UNAVAILABLE;
        return Object.freeze({
          ok: false,
          state: this.status,
          available: false,
          reason: "WebGPU is not supported in this runtime environment."
        });
      }

      const adapter = await this.requestAdapter({ powerPreference: this.config.POWER_PREFERENCE });
      if (!adapter) {
        this.status = WEBGPU_STATUS.UNAVAILABLE;
        return Object.freeze({
          ok: false,
          state: this.status,
          available: false,
          reason: "Failed to acquire WebGPU adapter."
        });
      }

      const device = await this.requestDevice(adapter);
      if (!device) {
        this.status = WEBGPU_STATUS.UNAVAILABLE;
        return Object.freeze({
          ok: false,
          state: this.status,
          available: false,
          reason: "Failed to acquire WebGPU device."
        });
      }

      this.adapter = adapter;
      this.device = device;
      this.status = WEBGPU_STATUS.READY;

      // Handle device loss safely
      if (device.lost && typeof device.lost.then === "function") {
        device.lost.then(() => {
          this.status = WEBGPU_STATUS.ERROR;
          this.device = null;
        }).catch(() => {});
      }

      return Object.freeze({
        ok: true,
        state: this.status,
        available: true,
        version: WEBGPU_VERSION
      });
    } catch (err) {
      this.status = WEBGPU_STATUS.ERROR;
      this.lastError = err.message || "WebGPU manager initialization failed.";
      return Object.freeze({
        ok: false,
        state: this.status,
        available: false,
        reason: this.lastError
      });
    }
  }

  /**
   * Returns whether WebGPU is initialized and ready for execution.
   *
   * @returns {boolean}
   */
  isAvailable() {
    return this.status === WEBGPU_STATUS.READY && Boolean(this.device || this.customGpuProvider);
  }

  /**
   * Returns current manager status state.
   *
   * @returns {string}
   */
  getStatus() {
    return this.status;
  }

  /**
   * Returns safe non-fingerprinting hardware capability metadata.
   * Excludes raw hardware vendor names, renderer strings, or device IDs.
   *
   * @returns {object} { available: boolean, status: string, maxTextureDimension2D: number, supportedFeatures: Array<string> }
   */
  getCapabilities() {
    const limits = (this.device && this.device.limits) || (this.adapter && this.adapter.limits) || {};
    const features = (this.device && this.device.features) || (this.adapter && this.adapter.features) || [];

    const supportedFeatures = Array.isArray(features)
      ? features
      : typeof features[Symbol.iterator] === "function"
      ? Array.from(features)
      : [];

    return Object.freeze({
      available: this.isAvailable(),
      status: this.status,
      maxTextureDimension2D: Number(limits.maxTextureDimension2D || 8192),
      supportedFeatures: Object.freeze(supportedFeatures),
      backend: GPU_BACKEND_CAPABILITIES.WEBGPU
    });
  }

  /**
   * Disposes of WebGPU resources and resets manager state to DISPOSED.
   *
   * @returns {object} { ok: boolean, state: string }
   */
  dispose() {
    if (this.device && typeof this.device.destroy === "function") {
      try {
        this.device.destroy();
      } catch (err) {}
    }
    this.adapter = null;
    this.device = null;
    this.status = WEBGPU_STATUS.DISPOSED;
    this.lastError = null;

    return Object.freeze({
      ok: true,
      state: this.status
    });
  }
}

/**
 * Factory function for creating a WebGpuManager instance.
 *
 * @param {object} [config={}]
 * @returns {WebGpuManager}
 */
export function createWebGpuManager(config = {}) {
  return new WebGpuManager(config);
}

// Default singleton instance
export const webGpuManager = createWebGpuManager();
