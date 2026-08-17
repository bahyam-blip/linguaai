// LinguaAI extension — background service worker
// Calls a Supabase Edge Function (grammar-check) instead of the Sarvam API directly.
// The Sarvam AI API key is kept server-side inside the Edge Function, so users never
// need to enter one. Only the Supabase Project URL and anon key (safe to expose in
// client apps) are required — both are stored in chrome.storage.sync and entered via
// the options page.

const EDGE_FUNCTION_PATH = "/functions/v1/grammar-check";

async function getSupabaseConfig() {
  const { supabaseUrl = "", supabaseAnonKey = "" } = await chrome.storage.sync.get([
    "supabaseUrl",
    "supabaseAnonKey",
  ]);
  return { supabaseUrl, supabaseAnonKey };
}

async function getSettings() {
  const defaults = {
    checkGrammar: true,
    checkSpelling: true,
    checkPunctuation: true,
    checkStyle: true,
    checkClarity: true,
    checkVocabulary: true,
    checkCapitalization: true,
  };
  const stored = await chrome.storage.sync.get(defaults);
  return stored;
}

// Analyze text for grammar/writing issues via the Supabase Edge Function.
// The Edge Function owns the Sarvam API call, prompt engineering and response parsing,
// and already returns { issues, correctedText, overallScore }.
async function analyzeText(text, mode = "full") {
  const { supabaseUrl, supabaseAnonKey } = await getSupabaseConfig();

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      error:
        "Supabase is not configured. Open the LinguaAI extension options to add your Supabase Project URL and anon key.",
    };
  }

  // Pass the enabled issue categories through to the Edge Function so it can honour
  // the user's toggle selections. Omitted when mode is "stats-only".
  let categories = null;
  if (mode === "full") {
    const settings = await getSettings();
    const enabledTypes = [];
    if (settings.checkGrammar) enabledTypes.push("grammar");
    if (settings.checkSpelling) enabledTypes.push("spelling");
    if (settings.checkPunctuation) enabledTypes.push("punctuation");
    if (settings.checkStyle) enabledTypes.push("style");
    if (settings.checkClarity) enabledTypes.push("clarity");
    if (settings.checkVocabulary) enabledTypes.push("vocabulary");
    if (settings.checkCapitalization) enabledTypes.push("capitalization");
    if (enabledTypes.length > 0 && enabledTypes.length < 7) {
      categories = enabledTypes;
    }
  }

  const endpoint = supabaseUrl.replace(/\/+$/, "") + EDGE_FUNCTION_PATH;

  const body = {
    text,
    mode,
  };
  if (categories) body.categories = categories;

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
        Authorization: "Bearer " + supabaseAnonKey,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: "Network error: " + err.message };
  }

  if (!res.ok) {
    let detail = "";
    try {
      const errBody = await res.json();
      detail =
        errBody?.error?.message || errBody?.detail || errBody?.error || JSON.stringify(errBody);
    } catch {
      try {
        detail = await res.text();
      } catch {
        detail = "";
      }
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error:
          "Supabase authentication failed. Please check your Supabase Project URL and anon key in the extension options.",
      };
    }
    return {
      ok: false,
      error: "Supabase Edge Function error " + res.status + ": " + detail.slice(0, 200),
    };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: "Failed to parse Supabase Edge Function response." };
  }

  // The Edge Function returns the format the extension already expects:
  // { issues, correctedText, overallScore }
  const issues = Array.isArray(data.issues)
    ? data.issues.filter((i) => i && i.original && i.suggestion)
    : [];
  const correctedText = typeof data.correctedText === "string" ? data.correctedText : text;
  const overallScore = typeof data.overallScore === "number" ? data.overallScore : 100;

  return { ok: true, data: { issues, correctedText, overallScore } };
}

// Rewrite / transform text via the same Supabase Edge Function.
// The action (e.g. "rewrite", "simplify", "formalize", "translate") plus an optional
// instruction and target language are passed straight through for the Edge Function.
async function rewriteText(text, { action, instruction, targetLang } = {}) {
  const { supabaseUrl, supabaseAnonKey } = await getSupabaseConfig();

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      error:
        "Supabase is not configured. Open the LinguaAI extension options to add your Supabase Project URL and anon key.",
    };
  }

  const endpoint = supabaseUrl.replace(/\/+$/, "") + EDGE_FUNCTION_PATH;

  const body = {
    text,
    action,
    instruction,
    targetLang,
  };

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
        Authorization: "Bearer " + supabaseAnonKey,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: "Network error: " + err.message };
  }

  if (!res.ok) {
    let detail = "";
    try {
      const errBody = await res.json();
      detail =
        errBody?.error?.message || errBody?.detail || errBody?.error || JSON.stringify(errBody);
    } catch {
      try {
        detail = await res.text();
      } catch {
        detail = "";
      }
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error:
          "Supabase authentication failed. Please check your Supabase Project URL and anon key in the extension options.",
      };
    }
    return {
      ok: false,
      error: "Supabase Edge Function error " + res.status + ": " + detail.slice(0, 200),
    };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: "Failed to parse Supabase Edge Function response." };
  }

  return { ok: true, data };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "linguaai-check-selection",
    title: "Check grammar with LinguaAI",
    contexts: ["selection"],
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
      chrome.tabs
        .sendMessage(tab.id, {
          type: "LINGUAAI_SELECTION_RESULT",
          payload: { input: info.selectionText, data },
        })
        .catch(() => {
          chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
        });
    } catch (err) {
      console.error("LinguaAI analyze error:", err);
    }
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "check-selection") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: "LINGUAAI_CHECK_SELECTION" }).catch(() => undefined);
  } else if (command === "open-popup-editor") {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "LINGUAAI_ANALYZE") {
    analyzeText(msg.text, msg.mode || "full")
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
    return true;
  }
  if (msg?.type === "LINGUAAI_TEST_KEY") {
    (async () => {
      const result = await analyzeText("This is a test.", "stats-only");
      sendResponse(result);
    })();
    return true;
  }
});
