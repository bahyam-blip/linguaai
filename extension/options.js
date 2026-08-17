// LinguaAI options v2 — per-website controls, language, writing style, custom dictionary

const supabaseUrlInput = document.getElementById('supabaseUrl');
const supabaseAnonKeyInput = document.getElementById('supabaseAnonKey');
const toggleKeyBtn = document.getElementById('toggleKey');
const saveKeyBtn = document.getElementById('saveKey');
const testKeyBtn = document.getElementById('testKey');
const testResultEl = document.getElementById('testResult');
const enabledToggle = document.getElementById('enabled');
const autoCheckToggle = document.getElementById('autoCheck');
const enableFloatingToggle = document.getElementById('enableFloatingAssistant');
const enableInlineToggle = document.getElementById('enableInlineSuggestions');
const enableAutoCorrectToggle = document.getElementById('enableAutoCorrect');
const enableAIToggle = document.getElementById('enableAI');
const enableSynonymsToggle = document.getElementById('enableSynonyms');
const enableLearningModeToggle = document.getElementById('enableLearningMode');
const languageSelect = document.getElementById('language');
const writingStyleSelect = document.getElementById('writingStyle');
const categoryTogglesEl = document.getElementById('categoryToggles');
const siteInput = document.getElementById('siteInput');
const addSiteBtn = document.getElementById('addSite');
const siteListEl = document.getElementById('siteList');
const wordInput = document.getElementById('wordInput');
const addWordBtn = document.getElementById('addWord');
const dictionaryListEl = document.getElementById('dictionaryList');

const CATEGORIES = [
  { key: 'checkGrammar', label: 'Grammar', desc: 'Subject-verb agreement, verb tense, articles' },
  { key: 'checkSpelling', label: 'Spelling', desc: 'Misspelled words and typos' },
  { key: 'checkPunctuation', label: 'Punctuation', desc: 'Commas, periods, question marks' },
  { key: 'checkCapitalization', label: 'Capitalization', desc: 'Proper nouns, sentence starts' },
  { key: 'checkStyle', label: 'Style', desc: 'Style improvements' },
  { key: 'checkClarity', label: 'Clarity', desc: 'Unclear or ambiguous phrasing' },
  { key: 'checkVocabulary', label: 'Vocabulary', desc: 'Word choice suggestions' },
  { key: 'checkTone', label: 'Tone', desc: 'Tone detection and analysis' },
];

async function loadSettings() {
  const defaults = {
    supabaseUrl: '',
    supabaseAnonKey: '',
    enabled: true,
    autoCheck: true,
    enableFloatingAssistant: true,
    enableInlineSuggestions: true,
    enableAutoCorrect: false,
    enableAI: true,
    enableSynonyms: true,
    enableDefinitions: true,
    enableLearningMode: false,
    enableSearchFields: false,
    checkGrammar: true,
    checkSpelling: true,
    checkPunctuation: true,
    checkStyle: true,
    checkClarity: true,
    checkVocabulary: true,
    checkCapitalization: true,
    checkTone: true,
    language: 'en-IN',
    writingStyle: 'general',
  };
  const stored = await chrome.storage.sync.get(defaults);
  supabaseUrlInput.value = stored.supabaseUrl;
  supabaseAnonKeyInput.value = stored.supabaseAnonKey;
  enabledToggle.checked = stored.enabled;
  autoCheckToggle.checked = stored.autoCheck;
  enableFloatingToggle.checked = stored.enableFloatingAssistant;
  enableInlineToggle.checked = stored.enableInlineSuggestions;
  enableAutoCorrectToggle.checked = stored.enableAutoCorrect;
  enableAIToggle.checked = stored.enableAI;
  enableSynonymsToggle.checked = stored.enableSynonyms;
  enableLearningModeToggle.checked = stored.enableLearningMode;
  languageSelect.value = stored.language;
  writingStyleSelect.value = stored.writingStyle;

  // Render category toggles
  categoryTogglesEl.innerHTML = CATEGORIES.map(cat => `
    <div class="toggle-row">
      <div class="toggle-info">
        <span class="toggle-label">${cat.label}</span>
        <span class="toggle-desc">${cat.desc}</span>
      </div>
      <label class="switch">
        <input type="checkbox" id="${cat.key}" ${stored[cat.key] ? 'checked' : ''} />
        <span class="slider"></span>
      </label>
    </div>`).join('');

  CATEGORIES.forEach(cat => {
    const el = document.getElementById(cat.key);
    if (el) el.addEventListener('change', () => {
      chrome.storage.sync.set({ [cat.key]: el.checked });
      notifyContentScripts();
    });
  });

  // Load site settings
  loadSiteSettings();
  // Load custom dictionary
  loadDictionary();
}

function notifyContentScripts() {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      try { chrome.tabs.sendMessage(tab.id, { type: 'LINGUAAI_SETTINGS_UPDATED' }); } catch (_) {}
    }
  });
}

// ── Save / test Supabase config ──
saveKeyBtn.addEventListener('click', () => {
  const url = supabaseUrlInput.value.trim();
  const anonKey = supabaseAnonKeyInput.value.trim();
  if (!url || !anonKey) {
    testResultEl.textContent = 'Please enter both your Supabase URL and anon key.';
    testResultEl.className = 'test-result error';
    return;
  }
  chrome.storage.sync.set({ supabaseUrl: url, supabaseAnonKey: anonKey }, () => {
    testResultEl.textContent = 'Configuration saved.';
    testResultEl.className = 'test-result success';
    notifyContentScripts();
    setTimeout(() => { testResultEl.textContent = ''; }, 3000);
  });
});

testKeyBtn.addEventListener('click', () => {
  const url = supabaseUrlInput.value.trim();
  const anonKey = supabaseAnonKeyInput.value.trim();
  if (!url || !anonKey) {
    testResultEl.textContent = 'Enter your Supabase URL and anon key first.';
    testResultEl.className = 'test-result error';
    return;
  }
  chrome.storage.sync.set({ supabaseUrl: url, supabaseAnonKey: anonKey }, () => {
    testResultIl.innerHTML = '<span style="color:#6b7280;">Testing…</span>';
    testResultEl.className = 'test-result';
    chrome.runtime.sendMessage({ type: 'LINGUAAI_TEST_KEY' }, (resp) => {
      if (resp && resp.ok) {
        testResultEl.textContent = '✓ Connection successful! Supabase Edge Function is ready.';
        testResultEl.className = 'test-result success';
      } else {
        testResultIl.textContent = '✗ ' + (resp ? resp.error : 'Connection failed.');
        testResultEl.className = 'test-result error';
      }
    });
  });
});

toggleKeyBtn.addEventListener('click', () => {
  if (supabaseAnonKeyInput.type === 'password') {
    supabaseAnonKeyInput.type = 'text';
    toggleKeyBtn.textContent = 'Hide';
  } else {
    supabaseAnonKeyInput.type = 'password';
    toggleKeyBtn.textContent = 'Show';
  }
});

// ── Toggle listeners ──
enabledToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: enabledToggle.checked });
  notifyContentScripts();
});
autoCheckToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ autoCheck: autoCheckToggle.checked });
  notifyContentScripts();
});
enableFloatingToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enableFloatingAssistant: enableFloatingToggle.checked });
  notifyContentScripts();
});
enableInlineToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enableInlineSuggestions: enableInlineToggle.checked });
  notifyContentScripts();
});
enableAutoCorrectToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enableAutoCorrect: enableAutoCorrectToggle.checked });
  notifyContentScripts();
});
enableAIToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enableAI: enableAIToggle.checked });
  notifyContentScripts();
});
enableSynonymsToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enableSynonyms: enableSynonymsToggle.checked });
  notifyContentScripts();
});
enableLearningModeToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enableLearningMode: enableLearningModeToggle.checked });
  notifyContentScripts();
});
languageSelect.addEventListener('change', () => {
  chrome.storage.sync.set({ language: languageSelect.value });
  notifyContentScripts();
});
writingStyleSelect.addEventListener('change', () => {
  chrome.storage.sync.set({ writingStyle: writingStyleSelect.value });
  notifyContentScripts();
});

// ── Per-website controls ──
async function loadSiteSettings() {
  const { siteSettings = {} } = await chrome.storage.sync.get(['siteSettings']);
  const hosts = Object.keys(siteSettings);
  if (hosts.length === 0) {
    siteListEl.innerHTML = '<div style="color:#94A3B8;font-size:13px;padding:8px 0;">No websites blocked. LinguaAI is enabled everywhere.</div>';
    return;
  }
  siteListEl.innerHTML = hosts.map(host => `
    <div class="site-row">
      <span>${escapeHtml(host)}</span>
      <button class="btn-remove" data-host="${escapeHtml(host)}">Remove</button>
    </div>`).join('');
  siteListEl.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const host = btn.dataset.host;
      const { siteSettings = {} } = await chrome.storage.sync.get(['siteSettings']);
      delete siteSettings[host];
      await chrome.storage.sync.set({ siteSettings });
      loadSiteSettings();
      notifyContentScripts();
    });
  });
}

addSiteBtn.addEventListener('click', async () => {
  let host = siteInput.value.trim().toLowerCase();
  if (!host) return;
  // Normalize: remove protocol and path
  host = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const { siteSettings = {} } = await chrome.storage.sync.get(['siteSettings']);
  siteSettings[host] = 'disabled';
  await chrome.storage.sync.set({ siteSettings });
  siteInput.value = '';
  loadSiteSettings();
  notifyContentScripts();
});

// ── Custom dictionary ──
async function loadDictionary() {
  const { customDictionary = [] } = await chrome.storage.sync.get(['customDictionary']);
  if (customDictionary.length === 0) {
    dictionaryListEl.innerHTML = '<div style="color:#94A3B8;font-size:13px;padding:8px 0;">No custom words added yet.</div>';
    return;
  }
  dictionaryListEl.innerHTML = customDictionary.map(word => `
    <div class="word-row">
      <span>${escapeHtml(word)}</span>
      <button class="btn-remove" data-word="${escapeHtml(word)}">Remove</button>
    </div>`).join('');
  dictionaryListEl.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const word = btn.dataset.word;
      const { customDictionary = [] } = await chrome.storage.sync.get(['customDictionary']);
      const idx = customDictionary.indexOf(word);
      if (idx >= 0) {
        customDictionary.splice(idx, 1);
        await chrome.storage.sync.set({ customDictionary });
        loadDictionary();
        notifyContentScripts();
      }
    });
  });
}

addWordBtn.addEventListener('click', async () => {
  const word = wordInput.value.trim();
  if (!word) return;
  const { customDictionary = [] } = await chrome.storage.sync.get(['customDictionary']);
  if (!customDictionary.includes(word)) {
    customDictionary.push(word);
    await chrome.storage.sync.set({ customDictionary });
  }
  wordInput.value = '';
  loadDictionary();
  notifyContentScripts();
});

wordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addWordBtn.click(); }
});

siteInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addSiteBtn.click(); }
});

// ── Utility ──
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}

loadSettings();
