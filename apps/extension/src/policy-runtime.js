// Browser-runtime mirror of the tested policy. A build step will replace this with
// the shared privacy-core bundle before production release.
globalThis.PrivacyPolicy = Object.freeze({
  redactSensitiveFinding() {
    return "REDACT";
  }
});
