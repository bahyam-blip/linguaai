// LinguaAI extension v2 — background service worker
// Handles: analyze, rewrite, compose, chat, synonyms, per-site settings, custom dictionary

const EDGE_FUNCTION_PATH = "/functions/v1/grammar-check";

async function getSupabaseConfig() {
  const { supabaseUrl = "", supabaseAnonKey = "" } = await chrome.storage.sync.get([
    "supabaseUrl",
    "supabaseAnonKey",
  ]);
  // Normalize URL: ensure it has https:// prefix to prevent "no protocol:" errors
  if (supabaseUrl && !supabaseUrl.startsWith("http://") && !supabaseUrl.startsWith("https://")) {
    supabaseUrl = "https://" + supabaseUrl;
  }
  // Strip trailing slash so endpoint construction doesn't double up
  if (supabaseUrl) {
    supabaseUrl = supabaseUrl.replace(/\/+$/, "");
  }
  return { supabaseUrl, supabaseAnonKey };
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
    enableSynonyms: true,
    enableDefinitions: true,
    enableLearningMode: false,
    enableAutoCorrect: false,
    enableInlineSuggestions: true,
    enableFloatingAssistant: true,
    language: 'en-IN',
    writingStyle: 'general',
    enableSearchFields: false,
  };
  const stored = await chrome.storage.sync.get(defaults);
  return stored;
}

// ── Analyze text for grammar/writing issues ──
async function analyzeText(text, mode = 'full', context = '') {
  const { supabaseUrl, supabaseAnonKey } = await getSupabaseConfig();
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, error: 'Supabase is not configured. Open LinguaAI extension options to add your Supabase Project URL and anon key.' };
  }

  var categories = null;
  if (mode === 'full') {
    const settings = await getSettings();
    const enabledTypes = [];
    if (settings.checkGrammar) enabledTypes.push('grammar');
    if (settings.checkSpelling) enabledTypes.push('spelling');
    if (settings.checkPunctuation) enabledTypes.push('punctuation');
    if (settings.checkStyle) enabledTypes.push('style');
    if (settings.checkClarity) enabledTypes.push('clarity');
    if (settings.checkVocabulary) enabledTypes.push('vocabulary');
    if (settings.checkCapitalization) enabledTypes.push('capitalization');
    if (settings.checkTone) enabledTypes.push('tone');
    if (enabledTypes.length > 0 && enabledTypes.length < 9) {
      categories = enabledTypes;
    }
  }

  const endpoint = supabaseUrl + EDGE_FUNCTION_PATH;
  const body = { text, mode };
  if (categories) body.categories = categories;
  if (context) body.context = context;

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: 'Bearer ' + supabaseAnonKey,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: 'Network error: ' + err.message };
  }

  if (!res.ok) {
    let detail = '';
    try {
      const errBody = await res.json();
      detail = errBody?.error?.message || errBody?.message || errBody?.error || JSON.stringify(errBody);
    } catch {
      try { detail = await res.text(); } catch { detail = ''; }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: 'Supabase authentication failed. Please check your Supabase Project URL and anon key in the extension options.' };
    }
    return { ok: false, error: 'Supabase Edge Function error ' + res.status + ': ' + detail.slice(0, 200) };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'Failed to parse Supabase Edge Function response.' };
  }

  const issues = Array.isArray(data.issues)
    ? data.issues.filter(i => i && i.original && i.suggestion)
    : [];
  const correctedText = typeof data.correctedText === 'string' ? data.correctedText : text;
  const overallScore = typeof data.overallScore === 'number' ? data.overallScore : 100;
  const tone = data.tone || '';
  const wordCount = data.wordCount || 0;

  return { ok: true, data: { issues, correctedText, overallScore, tone, wordCount } };
}

// ── Rewrite / transform text ──
async function rewriteText(text, { action, instruction, targetLang, context } = {}) {
  const { supabaseUrl, supabaseAnonKey } = await getSupabaseConfig();
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, error: 'Supabase is not configured. Open LinguaAI extension options.' };
  }

  const endpoint = supabaseUrl + EDGE_FUNCTION_PATH;
  const body = { text, action, instruction, targetLang, mode: 'rewrite' };
  if (context) body.context = context;

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: 'Bearer ' + supabaseAnonKey,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: 'Network error: ' + err.message };
  }

  if (!res.ok) {
    let detail = '';
    try {
      const errBody = await res.json();
      detail = errBody?.error?.message || errBody?.message || errBody?.error || JSON.stringify(errBody);
    } catch {
      try { detail = await res.text(); } catch { detail = ''; }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: 'Supabase authentication failed. Check your URL and anon key.' };
    }
    return { ok: false, error: 'Edge Function error ' + res.status + ': ' + detail.slice(0, 200) };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'Failed to parse response.' };
  }

  return { ok: true, data };
}

// ── Chat with AI ──
async function chatWithAI(message, context, selection) {
  const { supabaseUrl, supabaseAnonKey } = await getSupabaseConfig();
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const endpoint = supabaseUrl + EDGE_FUNCTION_PATH;
  const prompt = selection
    ? `Selected text: "${selection}"\n\nUser question: ${message}`
    : context
      ? `Current text context: "${context}"\n\nUser question: ${message}`
      : `User question: ${message}`;

  const body = { text: prompt, action: 'chat', instruction: message, mode: 'rewrite' };

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: 'Bearer ' + supabaseAnonKey,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: 'Network error: ' + err.message };
  }

  if (!res.ok) {
    let detail = '';
    try {
      const errBody = await res.json();
      detail = errBody?.error?.message || errBody?.message || errBody?.error || JSON.stringify(errBody);
    } catch {
      try { detail = await res.text(); } catch { detail = ''; }
    }
    return { ok: false, error: 'Error ' + res.status + ': ' + detail.slice(0, 200) };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'Failed to parse response.' };
  }

  return { ok: true, data };
}

// ── Synonyms / definitions ──
async function getSynonyms(word) {
  const { supabaseUrl, supabaseAnonKey } = await getSupabaseConfig();
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const endpoint = supabaseUrl + EDGE_FUNCTION_PATH;
  const body = {
    text: word,
    action: 'synonyms',
    instruction: `Provide synonyms, alternatives, and a definition for the word "${word}". Return JSON: { "definition": "...", "synonyms": ["word1", "word2", ...], "alternatives": ["formal1", "simpler1", ...] }`,
    mode: 'rewrite',
  };

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: 'Bearer ' + supabaseAnonKey,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: 'Network error: ' + err.message };
  }

  if (!res.ok) {
    let detail = '';
    try {
      const errBody = await res.json();
      detail = errBody?.error?.message || errBody?.message || errBody?.error || JSON.stringify(errBody);
    } catch {
      try { detail = await res.text(); } catch { detail = ''; }
    }
    return { ok: false, error: 'Error ' + res.status + ': ' + detail.slice(0, 200) };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'Failed to parse response.' };
  }

  return { ok: true, data };
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
