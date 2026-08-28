/**
 * Step 2 privacy boundary:
 * This script intentionally reads no page text, inputs, images, cookies, or full URL.
 * The returned data stays inside the extension and is never sent over the network.
 */
function collectSafePageMetadata() {
  return {
    hostname: window.location.hostname,
    protocol: window.location.protocol.replace(":", ""),
    language: document.documentElement.lang || "not declared",
    contentType: document.contentType || "not declared",
    capturedAt: new Date().toISOString()
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "CAPTURE_SAFE_PAGE_METADATA") {
    return;
  }

  sendResponse({ ok: true, metadata: collectSafePageMetadata() });
});
