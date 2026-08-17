// LinguaAI extension v5 — background service worker
// Handles: analyze, rewrite, per-site settings, custom dictionary

const DEFAULT_API_ENDPOINT = "https://preview-linguaai.space-z.ai/api/grammar";

async function getApiConfig() {
  const { apiEndpoint = "" } = await chrome.storage.sync.get(["apiEndpoint"]);
  // If user has configured a custom endpoint, use it; otherwise use the default
  const endpoint = apiEndpoint || DEFAULT_API_ENDPOINT;
  // Normalize: ensure it has https:// prefix
  if (endpoint && !endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
    return "https://" + endpoint;
  }
  return endpoint.replace(/\/+$/, "");
}

async function getSettings() {
  const defaults = {
    enabled: true,
    autoCheck: true,
    checkGrammar: true,
    checkSpelling: true,
    checkPunctuation: true,
    checkStyle: true,
    checkClarity: true,
    checkVocabulary: true,
    checkCapitalization: true,
    checkTone: true,
    enableAI: true,
    enableInlineSuggestions: true,
    language: 'en',
    writingStyle: 'general',
  };
  const stored = await chrome.storage.sync.get(defaults);
  return stored;
}

// ── Analyze text for grammar/writing issues ──
async function analyzeText(text, mode = 'full', context = '') {
  const endpoint = await getApiConfig();
  if (!endpoint) {
    return { ok: false, error: 'API endpoint is not configured.' };
  }

  const body = { text, mode };
  if (context) body.context = context;

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: 'Network error: ' + err.message };
  }

  if (!res.ok) {
    let detail = '';
    try { const errBody = await res.json(); detail = errBody?.error || JSON.stringify(errBody); } catch { try { detail = await res.text(); } catch {} }
    return { ok: false, error: 'API error ' + res.status + ': ' + detail.slice(0, 200) };
  }

  let data;
  try { data = await res.json(); } catch { return { ok: false, error: 'Failed to parse response.' }; }

  const issues = Array.isArray(data.issues) ? data.issues.filter(i => i && i.original && i.suggestion) : [];
  const correctedText = typeof data.correctedText === 'string' ? data.correctedText : text;
  const overallScore = typeof data.overallScore === 'number' ? data.overallScore : 100;
  const tone = data.tone?.tone || data.tone || '';
  const wordCount = data.stats?.wordCount || 0;

  return { ok: true, data: { issues, correctedText, overallScore, tone, wordCount } };
}

// ── Rewrite / transform text ──
async function rewriteText(text, { action, instruction, targetLang, context } = {}) {
  const endpoint = await getApiConfig();
  if (!endpoint) {
    return { ok: false, error: 'API endpoint is not configured.' };
  }

  const rewriteUrl = endpoint.replace(/\/grammar$/, '/rewrite');
  const body = { text, action, instruction, targetLang };

  let res;
  try {
    res = await fetch(rewriteUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: 'Network error: ' + err.message };
  }

  if (!res.ok) {
    let detail = '';
    try { const errBody = await res.json(); detail = errBody?.error || JSON.stringify(errBody); } catch { try { detail = await res.text(); } catch {} }
    return { ok: false, error: 'API error ' + res.status + ': ' + detail.slice(0, 200) };
  }

  let data;
  try { data = await res.json(); } catch { return { ok: false, error: 'Failed to parse response.' }; }

  return { ok: true, data };
}

// ── Chat with AI (uses rewrite endpoint with ai_command action) ──
async function chatWithAI(message, context, selection) {
  const prompt = selection ? `Selected text: "${selection}"\n\nUser question: ${message}`
    : context ? `Current text: "${context}"\n\nUser question: ${message}`
    : `User question: ${message}`;
  return rewriteText(prompt, { action: 'ai_command', instruction: message });
}

// ── Synonyms (uses rewrite endpoint) ──
async function getSynonyms(word) {
  return rewriteText(word, { action: 'ai_command', instruction: `Provide synonyms, alternatives, and a definition for the word "${word}". Return JSON: { "definition": "...", "synonyms": ["word1", "word2", ...] }` });
}

// ── Per-site settings ──
async function getSiteSettings() {
  const { siteSettings = {} } = await chrome.storage.sync.get(['siteSettings']);
  return siteSettings;
}

async function setSiteSetting(host, status) {
  const { siteSettings = {} } = await chrome.storage.sync.get(['siteSettings']);
  if (status === 'enabled') {
    delete siteSettings[host];
  } else {
    siteSettings[host] = status;
  }
  await chrome.storage.sync.set({ siteSettings });
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      chrome.tabs.sendMessage(tab.id, { type: 'LINGUAAI_SETTINGS_UPDATED' });
    } catch (_) {}
  }
  return { ok: true };
}

// ── Custom dictionary ──
async function addToDictionary(word) {
  const { customDictionary = [] } = await chrome.storage.sync.get(['customDictionary']);
  if (!customDictionary.includes(word)) {
    customDictionary.push(word);
    await chrome.storage.sync.set({ customDictionary });
  }
  return { ok: true };
}

async function removeFromDictionary(word) {
  const { customDictionary = [] } = await chrome.storage.sync.get(['customDictionary']);
  const idx = customDictionary.indexOf(word);
  if (idx >= 0) {
    customDictionary.splice(idx, 1);
    await chrome.storage.sync.set({ customDictionary });
  }
  return { ok: true };
}

// ── Install / context menu ──
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'linguaai-check-selection',
    title: 'Check grammar with LinguaAI',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: 'linguaai-rewrite-selection',
    title: 'Rewrite with LinguaAI',
    contexts: ['selection'],
  });
  chrome.storage.sync.get(['enabled'], (result) => {
    if (result.enabled === undefined) {
      chrome.storage.sync.set({ enabled: true, autoCheck: true });
    }
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.selectionText) return;
  if (info.menuItemId === 'linguaai-check-selection') {
    try {
      const data = await analyzeText(info.selectionText, 'full');
      await chrome.storage.session.set({
        lastAnalysis: { input: info.selectionText, data, ts: Date.now() },
      });
      chrome.action.openPopup?.();
      chrome.tabs.sendMessage(tab.id, {
        type: 'LINGUAAI_SELECTION_RESULT',
        payload: { input: info.selectionText, data },
      }).catch(() => {
        chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
      });
    } catch (err) {
      console.error('LinguaAI analyze error:', err);
    }
  } else if (info.menuItemId === 'linguaai-rewrite-selection') {
    chrome.tabs.sendMessage(tab.id, {
      type: 'LINGUAAI_OPEN_REWRITE',
      text: info.selectionText,
    }).catch(() => {});
  }
});

// ── Keyboard shortcuts ──
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'check-selection') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: 'LINGUAAI_CHECK_SELECTION' }).catch(() => undefined);
  } else if (command === 'open-popup-editor') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
  } else if (command === 'undo-last') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: 'LINGUAAI_UNDO' }).catch(() => undefined);
  }
});

// ── Message router ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  if (msg.type === 'LINGUAAI_ANALYZE') {
    analyzeText(msg.text, msg.mode || 'full', msg.context || '')
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err?.message || String(err) }));
    return true;
  }
  if (msg.type === 'LINGUAAI_REWRITE') {
    rewriteText(msg.text, { action: msg.action, instruction: msg.instruction, targetLang: msg.targetLang, context: msg.context })
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg.type === 'LINGUAAI_CHAT') {
    chatWithAI(msg.message, msg.context || '', msg.selection || '')
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg.type === 'LINGUAAI_SYNONYMS') {
    getSynonyms(msg.word)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg.type === 'LINGUAAI_TEST_KEY') {
    (async () => {
      const result = await analyzeText('This is a test.', 'stats-only');
      sendResponse(result);
    })();
    return true;
  }
  if (msg.type === 'LINGUAAI_GET_SITE_STATUS') {
    (async () => {
      const sites = await getSiteSettings();
      sendResponse({ ok: true, status: sites[sender.tab?.url ? new URL(sender.tab.url).hostname : ''] || 'enabled' });
    })();
    return true;
  }
  if (msg.type === 'LINGUAAI_SET_SITE') {
    setSiteSetting(msg.host, msg.status)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg.type === 'LINGUAAI_ADD_WORD') {
    addToDictionary(msg.word)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg.type === 'LINGUAAI_REMOVE_WORD') {
    removeFromDictionary(msg.word)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg.type === 'LINGUAAI_GET_DICTIONARY') {
    chrome.storage.sync.get(['customDictionary'], (result) => {
      sendResponse({ ok: true, dictionary: result.customDictionary || [] });
    });
    return true;
  }
  return false;
});
