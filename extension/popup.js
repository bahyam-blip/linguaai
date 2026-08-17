// LinguaAI popup v2 — editor + AI chat

const editor = document.getElementById('editor');
const analyzeBtn = document.getElementById('analyzeBtn');
const resultsEl = document.getElementById('results');
const statusBar = document.getElementById('statusBar');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const settingsBtn = document.getElementById('settingsBtn');
const optionsLink = document.getElementById('optionsLink');
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');
const chatInput = document.getElementById('chatInput');
const chatSend = document.getElementById('chatSend');
const chatLog = document.getElementById('chatLog');

// ── Tab switching ──
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.querySelector(`.tab-content[data-content="${tab.dataset.tab}"]`).classList.add('active');
  });
});

// ── Check Supabase config status ──
async function checkStatus() {
  const { supabaseUrl = '', supabaseAnonKey = '' } = await chrome.storage.sync.get(['supabaseUrl', 'supabaseAnonKey']);
  if (!supabaseUrl || !supabaseAnonKey) {
    statusDot.className = 'status-dot error';
    statusText.textContent = 'Not configured — open Options to add Supabase URL and anon key';
    analyzeBtn.disabled = true;
    return false;
  }
  statusDot.className = 'status-dot connected';
  statusText.textContent = 'Connected to Sarvam AI via Supabase';
  analyzeBtn.disabled = false;
  return true;
}

// ── Escape HTML ──
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"').replace(/'/g, '&#039;');
}

// ── Get severity class ──
function severityClass(sev) {
  if (sev === 'error' || sev === 'critical') return 'badge-error';
  if (sev === 'warn' || sev === 'warning') return 'badge-warn';
  if (sev === 'success' || sev === 'suggestion') return 'badge-success';
  return 'badge-suggestion';
}

// ── Analyze ──
function analyze() {
  const text = editor.value.trim();
  if (!text) return;
  resultsEl.innerHTML = '<div class="result-loading"><div class="spinner"></div>Analyzing your text…</div>';
  analyzeBtn.disabled = true;
  chrome.runtime.sendMessage({ type: 'LINGUAAI_ANALYZE', text, mode: 'full' }, (resp) => {
    analyzeBtn.disabled = false;
    if (!resp || !resp.ok) {
      resultsEl.innerHTML = `<div class="result-error">Analysis failed: ${escapeHtml(resp ? resp.error : 'Unknown error')}</div><div class="result-error-sub">Make sure your Supabase URL and anon key are set in Options.</div>`;
      return;
    }
    renderResults(text, resp.data);
  });
}

function renderResults(originalText, data) {
  const issues = (data.issues || []).filter(i => i && i.original && i.suggestion);
  let html = '';

  // Score
  if (typeof data.overallScore === 'number') {
    const score = data.overallScore;
    const color = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444';
    html += `<div class="score-bar"><span class="score-label">Writing Score</span><span class="score-value" style="color:${color};">${score}/100</span></div>`;
  }

  if (issues.length === 0) {
    html += `<div class="result-empty"><div class="result-empty-icon">\u2705</div><div class="result-empty-title">All clear!</div><div class="result-empty-sub">No issues detected in your text.</div></div>`;
    if (data.correctedText && data.correctedText !== originalText) {
      html += `<button class="accept-all" id="useCorrected">Use corrected version</button>`;
    }
    resultsEl.innerHTML = html;
    const useBtn = document.getElementById('useCorrected');
    if (useBtn) useBtn.addEventListener('click', () => {
      editor.value = data.correctedText;
      resultsEl.innerHTML = '<div class="result-empty"><div class="result-empty-icon">\u2705</div><div class="result-empty-title">Corrected!</div></div>';
    });
    return;
  }

  if (data.correctedText && data.correctedText !== originalText) {
    html += `<button class="accept-all" id="acceptAll">Accept all fixes (${issues.length})</button>`;
  }

  html += issues.map((issue, idx) => {
    const sevCls = severityClass(issue.severity);
    return `<div class="issue-card" data-idx="${idx}">
      <span class="issue-badge ${sevCls}">${escapeHtml(issue.type || 'suggestion')}</span>
      <div class="issue-fix">
        <span class="fix-orig">${escapeHtml(issue.original)}</span>
        <span class="fix-arrow">\u2192</span>
        <span class="fix-new">${escapeHtml(issue.suggestion)}</span>
      </div>
      ${issue.explanation ? `<div class="issue-explain">${escapeHtml(issue.explanation)}</div>` : ''}
      <div class="issue-actions">
        <button class="btn-fix btn-accept" data-idx="${idx}">Apply fix</button>
      </div>
    </div>`;
  }).join('');

  resultsEl.innerHTML = html;

  // Wire accept all
  const acceptAllBtn = document.getElementById('acceptAll');
  if (acceptAllBtn) {
    acceptAllBtn.addEventListener('click', () => {
      editor.value = data.correctedText;
      resultsEl.innerHTML = '<div class="result-empty"><div class="result-empty-icon">\u2705</div><div class="result-empty-title">All fixes applied!</div></div>';
    });
  }

  // Wire individual fixes
  resultsEl.querySelectorAll('.btn-accept').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const issue = issues[idx];
      if (!issue) return;
      const current = editor.value;
      const pos = current.indexOf(issue.original);
      if (pos >= 0) {
        editor.value = current.slice(0, pos) + issue.suggestion + current.slice(pos + issue.original.length);
        btn.closest('.issue-card').style.opacity = '0.4';
        btn.disabled = true;
        btn.textContent = 'Applied';
      }
    });
  });
}

// ── AI Chat ──
function sendChat() {
  const msg = chatInput.value.trim();
  if (!msg) return;
  chatInput.value = '';
  chatLog.insertAdjacentHTML('beforeend', `<div class="chat-msg user">${escapeHtml(msg)}</div>`);
  chatLog.scrollTop = chatLog.scrollHeight;
  const spinnerId = 'chat-sp-' + Date.now();
  chatLog.insertAdjacentHTML('beforeend', `<div id="${spinnerId}" class="chat-msg ai"><div class="spinner"></div></div>`);
  chatLog.scrollTop = chatLog.scrollHeight;

  const editorText = editor.value.trim().slice(0, 500);
  chrome.runtime.sendMessage({ type: 'LINGUAAI_CHAT', message: msg, context: editorText, selection: '' }, (resp) => {
    const sp = document.getElementById(spinnerId);
    if (sp) sp.remove();
    if (resp && resp.ok && resp.data) {
      const reply = resp.data.result || resp.data.reply || 'No response generated.';
      chatLog.insertAdjacentHTML('beforeend', `<div class="chat-msg ai">${escapeHtml(reply)}</div>`);
    } else {
      chatLog.insertAdjacentHTML('beforeend', `<div class="chat-msg ai">Sorry, I couldn't process that. ${escapeHtml(resp ? resp.error : 'Network error')}</div>`);
    }
    chatLog.scrollTop = chatLog.scrollHeight;
  });
}

// ── Event listeners ──
analyzeBtn.addEventListener('click', analyze);
editor.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); analyze(); }
});
settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
optionsLink.addEventListener('click', () => chrome.runtime.openOptionsPage());
chatSend.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } });

// ── Init ──
checkStatus();
editor.focus();

// Check for last analysis from context menu
chrome.storage.session.get(['lastAnalysis'], (result) => {
  if (result.lastAnalysis && result.lastAnalysis.ts > Date.now() - 60000) {
    const { input, data } = result.lastAnalysis;
    if (input && data && data.ok) {
      editor.value = input;
      renderResults(input, data.data);
    }
    chrome.storage.session.remove(['lastAnalysis']);
  }
});