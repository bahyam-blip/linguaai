// LinguaAI extension — background service worker
// Bridges content scripts and the LinguaAI backend API.

const API_ENDPOINT = "https://preview-linguaai.space-z.ai/api/grammar";
// Allow user to override the endpoint in options (for self-hosted deployments)
const DEFAULT_ENDPOINT = API_ENDPOINT;

async function getEndpoint() {
  const { linguaaiEndpoint } = await chrome.storage.sync.get({ linguaaiEndpoint: DEFAULT_ENDPOINT });
  return linguaaiEndpoint || DEFAULT_ENDPOINT;
}

async function analyzeText(text, mode = "full") {
  const endpoint = await getEndpoint();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, mode }),
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}`);
  }
  return res.json();
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "linguaai-check-selection",
    title: "Check grammar with LinguaAI",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "linguaai-open-popup-editor",
    title: "Open LinguaAI editor",
    contexts: ["editable"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "linguaai-check-selection" && info.selectionText) {
    try {
      const data = await analyzeText(info.selectionText, "full");
      await chrome.storage.session.set({
        lastAnalysis: { input: info.selectionText, data, ts: Date.now() },
      });
      chrome.action.openPopup?.();
      // Fallback: send to content script to show inline results
      chrome.tabs
        .sendMessage(tab.id, {
          type: "LINGUAAI_SELECTION_RESULT",
          payload: { input: info.selectionText, data },
        })
        .catch(() => {
          // Open the popup page in a new tab as fallback
          chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
        });
    } catch (err) {
      console.error("LinguaAI analyze error:", err);
    }
  } else if (info.menuItemId === "linguaai-open-popup-editor") {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-popup-editor") {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
  } else if (command === "check-selection") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: "LINGUAAI_CHECK_SELECTION" }).catch(() => undefined);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "LINGUAAI_ANALYZE") {
    analyzeText(msg.text, msg.mode || "full")
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
    return true; // async
  }
  if (msg?.type === "LINGUAAI_ANALYZE_STATS") {
    analyzeText(msg.text, "stats-only")
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
    return true;
  }
});
