const supabaseUrlInput = document.getElementById("supabaseUrl");
const supabaseAnonKeyInput = document.getElementById("supabaseAnonKey");
const toggleKeyBtn = document.getElementById("toggleKey");
const saveKeyBtn = document.getElementById("saveKey");
const testKeyBtn = document.getElementById("testKey");
const testResultEl = document.getElementById("testResult");
const enabledToggle = document.getElementById("enabled");
const autoCheckToggle = document.getElementById("autoCheck");
const categoryTogglesEl = document.getElementById("categoryToggles");

const CATEGORIES = [
  { key: "checkGrammar", label: "Grammar", desc: "Grammatical errors" },
  { key: "checkSpelling", label: "Spelling", desc: "Misspelled words" },
  { key: "checkPunctuation", label: "Punctuation", desc: "Missing or wrong punctuation" },
  { key: "checkStyle", label: "Style", desc: "Style improvements" },
  { key: "checkClarity", label: "Clarity", desc: "Unclear or ambiguous phrasing" },
  { key: "checkVocabulary", label: "Vocabulary", desc: "Word choice suggestions" },
  { key: "checkCapitalization", label: "Capitalization", desc: "Capitalization errors" },
];

async function loadSettings() {
  const defaults = {
    supabaseUrl: "",
    supabaseAnonKey: "",
    enabled: true,
    autoCheck: true,
    checkGrammar: true,
    checkSpelling: true,
    checkPunctuation: true,
    checkStyle: true,
    checkClarity: true,
    checkVocabulary: true,
    checkCapitalization: true,
  };
  const stored = await chrome.storage.sync.get(defaults);
  supabaseUrlInput.value = stored.supabaseUrl;
  supabaseAnonKeyInput.value = stored.supabaseAnonKey;
  enabledToggle.checked = stored.enabled;
  autoCheckToggle.checked = stored.autoCheck;
  categoryTogglesEl.innerHTML = CATEGORIES.map((cat) => '<div class="toggle-row"><div class="toggle-info"><span class="toggle-label">' + cat.label + '</span><span class="toggle-desc">' + cat.desc + '</span></div><label class="switch"><input type="checkbox" id="' + cat.key + '" ' + (stored[cat.key] ? "checked" : "") + ' /><span class="slider"></span></label></div>').join("");
  CATEGORIES.forEach((cat) => {
    const el = document.getElementById(cat.key);
    if (el) {
      el.addEventListener("change", () => {
        chrome.storage.sync.set({ [cat.key]: el.checked });
      });
    }
  });
}

saveKeyBtn.addEventListener("click", () => {
  const url = supabaseUrlInput.value.trim();
  const anonKey = supabaseAnonKeyInput.value.trim();
  if (!url || !anonKey) {
    testResultEl.textContent = "Please enter both your Supabase URL and anon key.";
    testResultEl.className = "test-result error";
    return;
  }
  chrome.storage.sync.set({ supabaseUrl: url, supabaseAnonKey: anonKey }, () => {
    testResultEl.textContent = "Supabase configuration saved.";
    testResultEl.className = "test-result success";
    setTimeout(() => { testResultEl.textContent = ""; }, 3000);
  });
});

testKeyBtn.addEventListener("click", () => {
  const url = supabaseUrlInput.value.trim();
  const anonKey = supabaseAnonKeyInput.value.trim();
  if (!url || !anonKey) {
    testResultEl.textContent = "Enter your Supabase URL and anon key first.";
    testResultEl.className = "test-result error";
    return;
  }
  chrome.storage.sync.set({ supabaseUrl: url, supabaseAnonKey: anonKey }, () => {
    testResultEl.innerHTML = '<span style="color:#6b7280;">Testing…</span>';
    chrome.runtime.sendMessage({ type: "LINGUAAI_TEST_KEY" }, (resp) => {
      if (resp?.ok) {
        testResultEl.textContent = "✓ Connection successful! Supabase Edge Function is ready.";
        testResultEl.className = "test-result success";
      } else {
        testResultEl.textContent = "✗ " + (resp?.error || "Connection failed.");
        testResultEl.className = "test-result error";
      }
    });
  });
});

toggleKeyBtn.addEventListener("click", () => {
  if (supabaseAnonKeyInput.type === "password") {
    supabaseAnonKeyInput.type = "text";
    toggleKeyBtn.textContent = "Hide";
  } else {
    supabaseAnonKeyInput.type = "password";
    toggleKeyBtn.textContent = "Show";
  }
});

enabledToggle.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: enabledToggle.checked });
});

autoCheckToggle.addEventListener("change", () => {
  chrome.storage.sync.set({ autoCheck: autoCheckToggle.checked });
});

loadSettings();
