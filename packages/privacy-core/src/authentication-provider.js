/**
 * Runtime-Injected Authentication Provider (Step 16).
 * Manages secure runtime authentication credentials (e.g., Bearer tokens, API keys).
 *
 * Privacy & Security Guarantees:
 * 1. Runtime Injection: Credentials are never hardcoded in source code, tests, or persistent files.
 * 2. Log Isolation: Auth tokens are marked non-enumerable/private and NEVER logged into plaintext output.
 * 3. Opaque Request Correlation: Correlation IDs NEVER incorporate user identity, tokens, or auth headers.
 */

import { AUTHENTICATION_STATUS } from "../../../packages/shared-types/src/privacy-contracts.js";

export class AuthenticationProvider {
  #token;
  #apiKey;

  constructor(customConfig = {}) {
    this.#token = null;
    this.#apiKey = null;
    this.status = AUTHENTICATION_STATUS.UNAUTHENTICATED;

    if (customConfig.token || customConfig.apiKey) {
      this.injectCredentials(customConfig);
    }
  }

  /**
   * Injects authentication credentials dynamically at runtime.
   *
   * @param {object} params
   * @param {string} [params.token]
   * @param {string} [params.apiKey]
   * @returns {object} { ok: boolean, status: string }
   */
  injectCredentials({ token, apiKey } = {}) {
    if (token && typeof token === "string" && token.trim().length > 0) {
      this.#token = token.trim();
      this.status = AUTHENTICATION_STATUS.AUTHENTICATED;
    } else if (apiKey && typeof apiKey === "string" && apiKey.trim().length > 0) {
      this.#apiKey = apiKey.trim();
      this.status = AUTHENTICATION_STATUS.AUTHENTICATED;
    } else {
      this.status = AUTHENTICATION_STATUS.UNAUTHENTICATED;
    }

    return Object.freeze({
      ok: this.status === AUTHENTICATION_STATUS.AUTHENTICATED,
      status: this.status
    });
  }

  /**
   * Returns current authentication headers for secure HTTP request construction.
   *
   * @returns {object}
   */
  getAuthHeader() {
    if (this.status !== AUTHENTICATION_STATUS.AUTHENTICATED) {
      return Object.freeze({});
    }

    if (this.#token) {
      return Object.freeze({ Authorization: `Bearer ${this.#token}` });
    }

    if (this.#apiKey) {
      return Object.freeze({ "X-API-Key": this.#apiKey });
    }

    return Object.freeze({});
  }

  /**
   * Returns current authentication status state.
   *
   * @returns {string}
   */
  getAuthStatus() {
    return this.status;
  }

  /**
   * Clears stored runtime authentication credentials cleanly.
   *
   * @returns {object}
   */
  clearCredentials() {
    this.#token = null;
    this.#apiKey = null;
    this.status = AUTHENTICATION_STATUS.UNAUTHENTICATED;
    return Object.freeze({
      ok: true,
      status: this.status
    });
  }
}

/**
 * Factory function for creating an AuthenticationProvider instance.
 *
 * @param {object} [config={}]
 * @returns {AuthenticationProvider}
 */
export function createAuthenticationProvider(config = {}) {
  return new AuthenticationProvider(config);
}

// Default singleton instance
export const authenticationProvider = createAuthenticationProvider();
