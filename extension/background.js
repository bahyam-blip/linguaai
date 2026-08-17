// LinguaAI extension — background service worker
// Calls Sarvam AI Chat Completion API directly.
// The API key is stored in chrome.storage.sync (user enters it via the options page).

const SARVAM_API_URL = "https://api.sarvam.ai/v1/chat/completions";
const SARVAM_MODEL = "sarvam-105b";

const GRAMMAR_SYSTEM_PROMPT = `You are LinguaAI, an expert grammar and writing assistant. Analyze the provided text for grammar, spelling, punctuation, style, clarity, vocabulary, and capitalization issues.

Return your analysis as a JSON object with this exact structure:
{
  "issues": [
    {
      "type": "grammar|spelling|punctuation|style|clarity|vocabulary|capitalization",
      "severity": "critical|warning|suggestion",
      "original": "exact substring from the text that has an issue",
      "suggestion": "the corrected version",
      "explanation": "brief explanation of the issue"
    }
  ],
  "correctedText": "the fully corrected text",
  "overallScore": <number 0-100>
}

Rules:
- "original" must be an EXACT substring from the input text (case-sensitive match)
- Only include issues where the suggestion genuinely differs from the original
- If the text is already correct, return an empty issues array and set correctedText to the original text
- Be concise but thorough — focus on real errors, not subjective stylistic preferences
- severity "critical" = grammar/spelling errors; "warning" = punctuation/capitalization; "suggestion" = style/clarity improvements`;

async function getApiKey() {
  const { linguaaiApiKey = "" } = await chrome.storage.sync.get("linguaaiApiKey");
  return linguaaiApiKey;
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

async function analyzeText(text, mode = "full") {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return {
      ok: false,
      error: "No API key configured. Open the LinguaAI extension options to add your Sarvam AI API key.",
    };
  }

  const settings = mode === "full" ? await getSettings() : null;
  let systemPrompt = GRAMMAR_SYSTEM_PROMPT;

  if (settings) {
    const enabledTypes = [];
    if (settings.checkGrammar) enabledTypes.push("grammar");
    if (settings.checkSpelling) enabledTypes.push("spelling");
    if (settings.checkPunctuation) enabledTypes.push("punctuation");
    if (settings.checkStyle) enabledTypes.push("style");
    if (settings.checkClarity) enabledTypes.push("clarity");
    if (settings.checkVocabulary) enabledTypes.push("vocabulary");
    if (settings.checkCapitalization) enabledTypes.push("capitalization");

    if (enabledTypes.length > 0 && enabledTypes.length < 7) {
      systemPrompt += "\n\nOnly check for these issue types: " + enabledTypes.join(", ") + ". Ignore other issue types.";
    }
  }

  if (mode === "stats-only") {
    systemPrompt += "\n\nReturn only the overallScore and an empty issues array. Do not list individual issues.";
  }

  const body = {
    model: SARVAM_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Analyze this text:\n\n" + text },
    ],
    temperature: 0.2,
    max_tokens: 4096,
    reasoning_effort: null,
  };

  let res;
  try {
    res = await fetch(SARVAM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": apiKey,
        Authorization: "Bearer " + apiKey,
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
      detail = errBody?.error?.message || errBody?.detail || JSON.stringify(errBody);
    } catch {
      try { detail = await res.text(); } catch { detail = ""; }
    }
    if (res.status === 403) {
      return { ok: false, error: "Invalid API key. Please check your Sarvam AI API key in the extension options." };
    }
    return { ok: false, error: "Sarvam API error " + res.status + ": " + detail.slice(0, 200) };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: "Failed to parse API response." };
  }

  const content = data?.choices?.[0]?.message?.content ?? "";

  let parsed = null;
  try {
    parsed = JSON.parse(content.trim());
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        try {
          const cleaned = jsonMatch[0]
            .replace(/,\s*([}\]])/g, "$1")
            .replace(/[\u0000-\u001F]+/g, " ");
          parsed = JSON.parse(cleaned);
        } catch {
          parsed = null;
        }
      }
    }
  }

  if (!parsed) {
    return { ok: false, error: "Could not parse analysis from API response." };
  }

  const issues = Array.isArray(parsed.issues) ? parsed.issues.filter(i => i && i.original && i.suggestion) : [];
  const correctedText = typeof parsed.correctedText === "string" ? parsed.correctedText : text;
  const overallScore = typeof parsed.overallScore === "number" ? parsed.overallScore : 100;

  return { ok: true, data: { issues, correctedText, overallScore } };
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