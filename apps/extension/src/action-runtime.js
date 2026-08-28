/**
 * Local Browser Action Runtime for Chrome Extension (Step 14).
 * Executes validated local DOM actions (clicking, text input, select, scrolling) on-device.
 */
(() => {
  /**
   * Dispatches a local click event to a DOM target element.
   *
   * @param {Element} element
   * @returns {boolean}
   */
  function performClick(element) {
    if (!element || typeof element.click !== "function") return false;
    try {
      element.click();
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Injects input text into a local form field element.
   *
   * @param {HTMLInputElement|HTMLTextAreaElement} element
   * @param {string} textValue
   * @returns {boolean}
   */
  function performInput(element, textValue) {
    if (!element || typeof textValue !== "string") return false;
    try {
      element.value = textValue;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Scrolls the browser window or container.
   *
   * @param {number} scrollX
   * @param {number} scrollY
   * @returns {boolean}
   */
  function performScroll(scrollX = 0, scrollY = 0) {
    if (typeof window === "undefined" || typeof window.scrollTo !== "function") return false;
    try {
      window.scrollTo({ left: scrollX, top: scrollY, behavior: "smooth" });
      return true;
    } catch (err) {
      return false;
    }
  }

  if (typeof globalThis !== "undefined") {
    globalThis.ActionRuntime = Object.freeze({
      performClick,
      performInput,
      performScroll
    });
  }
})();
