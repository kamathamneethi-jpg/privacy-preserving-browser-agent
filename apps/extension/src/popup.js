const captureButton = document.querySelector("#capture");
const scanButton = document.querySelector("#scan");
const status = document.querySelector("#status");
const metadataList = document.querySelector("#metadata");
const piiResults = document.querySelector("#pii-results");
const piiSummary = document.querySelector("#pii-summary");
const piiList = document.querySelector("#pii-list");

function renderMetadata(metadata) {
  metadataList.replaceChildren();

  for (const [label, value] of Object.entries(metadata)) {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    metadataList.append(term, description);
  }

  metadataList.hidden = false;
}

captureButton.addEventListener("click", async () => {
  status.textContent = "Capturing local metadata…";
  metadataList.hidden = true;
  piiResults.hidden = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) {
      throw new Error("No active browser tab was found.");
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "CAPTURE_SAFE_PAGE_METADATA"
    });

    if (!response?.ok) {
      throw new Error("The page did not return metadata.");
    }

    renderMetadata(response.metadata);
    status.textContent = "Captured locally. Nothing was sent to a server.";
  } catch {
    status.textContent = "This page cannot be inspected. Try a normal http or https website.";
  }
});

function renderPiiSummary(summary) {
  piiList.replaceChildren();
  piiSummary.textContent = summary.totalFindings
    ? `${summary.totalFindings} possible sensitive item(s) localized locally. Values are hidden.`
    : "No supported PII patterns were found in the scanned portion of this page.";

  for (const item of summary.categories) {
    const listItem = document.createElement("li");
    listItem.textContent = `${item.category}: ${item.count} — ${item.decision}`;
    piiList.append(listItem);
  }

  if (Array.isArray(summary.localizedItems) && summary.localizedItems.length > 0) {
    const header = document.createElement("li");
    header.style.fontWeight = "bold";
    header.style.marginTop = "6px";
    header.textContent = "Localized Bounding Boxes:";
    piiList.append(header);

    for (const loc of summary.localizedItems) {
      const locItem = document.createElement("li");
      locItem.style.fontSize = "0.85em";
      const bboxStr = loc.bbox ? `(x:${loc.bbox.x}, y:${loc.bbox.y}, w:${loc.bbox.width}, h:${loc.bbox.height})` : "no-bbox";
      locItem.textContent = `[${loc.source.toUpperCase()}] ${loc.category} @ ${bboxStr} (${Math.round(loc.confidence * 100)}%)`;
      piiList.append(locItem);
    }
  }

  if (summary.truncated) {
    const listItem = document.createElement("li");
    listItem.textContent = "Large page: scan stopped at the local safety limit.";
    piiList.append(listItem);
  }

  piiResults.hidden = false;
}

scanButton.addEventListener("click", async () => {
  status.textContent = "Scanning locally…";
  metadataList.hidden = true;
  piiResults.hidden = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) {
      throw new Error("No active browser tab was found.");
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: "SCAN_LOCAL_PII" });
    if (!response?.ok) {
      throw new Error("The page did not return a PII summary.");
    }

    renderPiiSummary(response.summary);
    status.textContent = "Scan completed locally. No detected values were retained or sent.";
  } catch {
    status.textContent = "This page cannot be scanned. Try a normal http or https website.";
  }
});
