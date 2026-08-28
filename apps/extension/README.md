# Browser extension

This is a Chrome/Chromium Manifest V3 extension. It captures only local page metadata and can run a local-only PII scan.

- website host name
- protocol (`http` or `https`)
- document language and content type
- a local capture timestamp

The metadata capture does **not** read page text, form fields, screenshots, cookies, or passwords. The Step 4 PII scan temporarily examines page text and field labels on-device to count possible email addresses, phone numbers, card-number patterns, and sensitive fields. It returns only category counts and `REDACT` decisions—never detected values. It does **not** make network requests or take actions on a page.

## Load the extension in Chrome or Chromium

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select this `apps/extension` folder.
5. Open any normal website, click the extension icon, then click **Capture page metadata** or **Scan page locally for PII**.

The popup shows local metadata or a safe PII summary. Chrome-owned pages such as `chrome://extensions` intentionally cannot be inspected.
