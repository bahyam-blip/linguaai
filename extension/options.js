// LinguaAI options v5 — clean, simple settings

const apiEndpointInput = document.getElementById('apiEndpoint');
const saveBtn = document.getElementById('save');
const testBtn = document.getElementById('testKey');
const statusEl = document.getElementById('status');
const addWordBtn = document.getElementById('addWord');
const newWordInput = document.getElementById('newWord');
const dictionaryListEl = document.getElementById('dictionaryList');

const CHECKBOXES = [
  'enabled', 'autoCheck', 'enableInlineSuggestions',
  'checkGrammar', 'checkSpelling', 'checkPunctuation', 'checkStyle',
  'checkClarity', 'checkVocabulary', 'checkCapitalization', 'checkTone',
];

async function loadSettings() {
  const defaults = {
    apiEndpoint: '',
    enabled: true,
    autoCheck: true,
    enableInlineSuggestions: true,
    checkGrammar: true, checkSpelling: true, checkPunctuation: true,
    checkStyle: true, checkClarity: true, checkVocabulary: true,
    checkCapitalization: true, checkTone: true,
  };
  const stored = await chrome.storage.sync.get(defaults);
  apiEndpointInput.value = stored.apiEndpoint || '';
  for (const key of CHECKBOXES) {
    const el = document.getElementById(key);
    if (el) el.checked = stored[key];
  }
  await loadDictionary();
}

async function loadDictionary() {
  const { customDictionary = [] } = await chrome.storage.sync.get(['customDictionary']);
  dictionaryListEl.innerHTML = '';
  for (const word of customDictionary) {
    const chip = document.createElement('span');
    chip.className = 'word-chip';
    chip.textContent = word;
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.onclick = async () => {
      const { customDictionary = [] } = await chrome.storage.sync.get(['customDictionary']);
      const idx = customDictionary.indexOf(word);
      if (idx >= 0) {
        customDictionary.splice(idx, 1);
        await chrome.storage.sync.set({ customDictionary });
        loadDictionary();
      }
    };
    chip.appendChild(removeBtn);
    dictionaryListEl.appendChild(chip);
  }
}

saveBtn.addEventListener('click', async () => {
  const settings = { apiEndpoint: apiEndpointInput.value.trim() };
  for (const key of CHECKBOXES) {
    const el = document.getElementById(key);
    if (el) settings[key] = el.checked;
  }
  await chrome.storage.sync.set(settings);
  showStatus('Settings saved.', 'success');
});

testBtn.addEventListener('click', async () => {
  showStatus('Testing connection...', 'info');
  const result = await chrome.runtime.sendMessage({ type: 'LINGUAAI_TEST_KEY' });
  if (result?.ok) {
    showStatus('✓ Connection successful! API is working.', 'success');
  } else {
    showStatus('✗ ' + (result?.error || 'Connection failed.'), 'error');
  }
});

addWordBtn.addEventListener('click', async () => {
  const word = newWordInput.value.trim();
  if (!word) return;
  const { customDictionary = [] } = await chrome.storage.sync.get(['customDictionary']);
  if (!customDictionary.includes(word)) {
    customDictionary.push(word);
    await chrome.storage.sync.set({ customDictionary });
  }
  newWordInput.value = '';
  loadDictionary();
});

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + type;
  setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'status'; }, 3000);
}

loadSettings();
