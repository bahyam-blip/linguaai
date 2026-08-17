// LinguaAI content script v2 — floating assistant panel, selection toolbar,
// colored highlights, field classification, MutationObserver, tone rewrite, AI compose
(function () {
  if (window.__linguaaiInjected) return;
  window.__linguaaiInjected = true;

  // ── State ──
  let floatingButton = null;
  let assistantPanel = null;
  let suggestionCard = null;
  let selectionToolbar = null;
  let composePanel = null;
  let debounceTimer = null;
  let lastAnalyzedText = "";
  let activeTarget = null;
  let activeIssues = [];
  let currentHighlights = [];
  let isEnabled = true;
  let undoStack = [];
  let ignoredSuggestions = new Set();
  let customDictionary = [];
  let perSiteDisabled = false;
  let settings = {};

  // ── Selectors ──
  const VALID_INPUTS = 'textarea, input[type="text"], input[type="email"], input[type="url"], [contenteditable="true"], [contenteditable=""]';
  const SKIP_INPUTS = 'input[type="password"], input[type="number"], input[type="tel"], input[type="hidden"], input[type="date"], input[type="time"], [data-linguaai-skip]';

  // ── Category colors ──
  const CATEGORY_STYLES = {
    grammar:       { color: '#EF4444', bg: 'rgba(239,68,68,0.08)',  label: 'Grammar' },
    spelling:      { color: '#EF4444', bg: 'rgba(239,68,68,0.08)',  label: 'Spelling' },
    punctuation:   { color: '#EF4444', bg: 'rgba(239,68,68,0.08)',  label: 'Punctuation' },
    capitalization:{ color: '#EF4444', bg: 'rgba(239,68,68,0.08)',  label: 'Capitalization' },
    clarity:       { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', label: 'Clarity' },
    style:         { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', label: 'Style' },
    conciseness:   { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', label: 'Conciseness' },
    vocabulary:    { color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', label: 'Vocabulary' },
    tone:          { color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)', label: 'Tone' },
    default:       { color: '#10B981', bg: 'rgba(16,185,129,0.08)', label: 'Suggestion' },
  };

  function getCategoryStyle(type) {
    const t = (type || '').toLowerCase();
    for (const key of Object.keys(CATEGORY_STYLES)) {
      if (t.includes(key)) return CATEGORY_STYLES[key];
    }
    return CATEGORY_STYLES.default;
  }

  // ── Utility: debounce ──
  function debounce(fn, wait) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // ── Utility: escapeHtml ──
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '\u0026amp;')
      .replace(/</g, '\u0026lt;')
      .replace(/>/g, '\u0026gt;')
      .replace(/"/g, '\u0026quot;')
      .replace(/'/g, '\u0026#039;');
  }

  // ── Field classification ──
  function classifyField(target) {
    if (!target) return 'unknown';
    const tag = target.tagName.toLowerCase();
    const type = (target.type || '').toLowerCase();
    const role = (target.getAttribute('role') || '').toLowerCase();
    const ariaLabel = (target.getAttribute('aria-label') || '').toLowerCase();
    const placeholder = (target.placeholder || '').toLowerCase();
    const id = (target.id || '').toLowerCase();
    const cls = (target.className || '').toLowerCase();

    // Skip sensitive fields
    if (type === 'password' || type === 'number' || type === 'tel' || type === 'hidden' || type === 'date' || type === 'time') return 'skip';
    if (target.matches(SKIP_INPUTS)) return 'skip';
    if (id.includes('otp') || id.includes('pin') || id.includes('cvv') || id.includes('card')) return 'skip';
    if (placeholder.includes('password') || placeholder.includes('otp') || placeholder.includes('cvv')) return 'skip';

    // Search boxes
    if (type === 'search' || role === 'searchbox' || id.includes('search') || placeholder.includes('search')) {
      return settings.enableSearchFields ? 'search' : 'skip';
    }

    // Email
    if (type === 'email' || id.includes('email') || placeholder.includes('email')) return 'email';

    // Chat / messaging
    if (id.includes('chat') || id.includes('message') || id.includes('compose') || cls.includes('chat') || cls.includes('message-input')) return 'chat';

    // Social media
    const host = location.hostname;
    if (host.includes('linkedin') || host.includes('twitter') || host.includes('x.com') || host.includes('facebook') || host.includes('instagram')) return 'social';

    // Professional
    if (host.includes('gmail') || host.includes('outlook') || host.includes('crm') || host.includes('salesforce')) return 'professional';

    if (tag === 'textarea' || target.isContentEditable) return 'text';
    return 'text';
  }

  // ── Load settings ──
  async function loadSettings() {
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
    try {
      const stored = await chrome.storage.sync.get(defaults);
      settings = stored;
      isEnabled = stored.enabled;
    } catch (e) {
      settings = defaults;
    }

    // Check per-site settings
    try {
      const siteSettings = await chrome.storage.sync.get(['siteSettings']);
      const sites = siteSettings.siteSettings || {};
      const host = location.hostname;
      if (sites[host] === 'disabled') {
        perSiteDisabled = true;
        isEnabled = false;
      }
    } catch (e) {}

    // Load custom dictionary
    try {
      const dict = await chrome.storage.sync.get(['customDictionary']);
      customDictionary = dict.customDictionary || [];
    } catch (e) {}

    // Load ignored suggestions
    try {
      const ignored = await chrome.storage.sync.get(['ignoredSuggestions']);
      const arr = ignored.ignoredSuggestions || [];
      ignoredSuggestions = new Set(arr);
    } catch (e) {}
  }

  // ── Get context around current text ──
  function getContext(target, text) {
    let context = '';
    if (target.isContentEditable) {
      let parent = target.closest('p, div, li, blockquote') || target.parentElement;
      if (parent && parent !== target) {
        context = (parent.innerText || '').trim();
      }
      let prev = target.previousElementSibling;
      if (prev && prev.innerText) {
        context = (prev.innerText.trim() + ' ' + context).slice(0, 500);
      }
    }
    return context.slice(0, 500);
  }

  // ── Get target text ──
  function getTargetText(target) {
    if (!target) return '';
    if (target.isContentEditable) {
      return (target.innerText || target.textContent || '').trim();
    }
    return (target.value || '').trim();
  }

  // ── Set target text ──
  function setTargetText(target, text) {
    if (!target) return;
    const oldText = getTargetText(target);
    if (oldText !== text) {
      undoStack.push({ target, oldText });
      if (undoStack.length > 20) undoStack.shift();
    }

    if (target.isContentEditable) {
      const sel = window.getSelection();
      const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      target.innerText = text;
      target.dispatchEvent(new InputEvent('input', { bubbles: true }));
      try {
        const newRange = document.createRange();
        newRange.selectNodeContents(target);
        newRange.collapse(false);
        sel.removeAllRanges();
        sel.addRange(newRange);
      } catch (_) {}
    } else {
      const start = target.selectionStart;
      const end = target.selectionEnd;
      target.value = text;
      try {
        target.setSelectionRange(start, end);
      } catch (_) {}
      target.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
  }

  // ── Undo last change ──
  function undoLastChange() {
    if (undoStack.length === 0) {
      showToast('Nothing to undo');
      return;
    }
    const { target, oldText } = undoStack.pop();
    if (target && document.body.contains(target)) {
      if (target.isContentEditable) {
        target.innerText = oldText;
        target.dispatchEvent(new InputEvent('input', { bubbles: true }));
      } else {
        target.value = oldText;
        target.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }
      showToast('Undone');
    }
  }

  // ── Toast notification ──
  let toastEl = null;
  function showToast(msg) {
    if (toastEl) toastEl.remove();
    toastEl = document.createElement('div');
    toastEl.id = 'linguaai-toast';
    toastEl.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483649;background:#1E293B;color:#fff;padding:10px 20px;border-radius:8px;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,0.3);opacity:0;transition:opacity 0.2s;';
    toastEl.textContent = msg;
    document.body.appendChild(toastEl);
    requestAnimationFrame(() => { toastEl.style.opacity = '1'; });
    setTimeout(() => {
      if (toastEl) {
        toastEl.style.opacity = '0';
        setTimeout(() => { if (toastEl) toastEl.remove(); }, 200);
      }
    }, 2500);
  }

  // ── Ensure styles ──
  function ensureStyles() {
    if (document.getElementById('linguaai-styles')) return;
    const st = document.createElement('style');
    st.id = 'linguaai-styles';
    st.textContent = `
      #linguaai-fab {
        position: fixed; z-index: 2147483646;
        width: 36px; height: 36px; border-radius: 50%;
        background: linear-gradient(135deg, #10B981, #059669);
        box-shadow: 0 4px 14px rgba(16,185,129,0.4);
        cursor: pointer; display: none;
        align-items: center; justify-content: center;
        transition: transform 0.15s ease;
      }
      #linguaai-fab:hover { transform: scale(1.1); }
      #linguaai-fab.linguaai-loading { opacity: 0.6; }
      #linguaai-fab .fab-badge {
        position: absolute; top: -4px; right: -4px;
        min-width: 18px; height: 18px; border-radius: 9px;
        background: #EF4444; color: #fff; font-size: 10px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        font-family: -apple-system, sans-serif; padding: 0 4px;
      }
      #linguaai-fab svg { width: 18px; height: 18px; }

      #linguaai-panel {
        position: fixed; z-index: 2147483647;
        width: 340px; max-height: 480px;
        background: #fff; border-radius: 16px;
        box-shadow: 0 16px 48px rgba(0,0,0,0.18);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px; color: #1E293B;
        display: none; flex-direction: column; overflow: hidden;
      }
      #linguaai-panel .lp-header {
        padding: 12px 16px; border-bottom: 1px solid #F1F5F9;
        display: flex; align-items: center; justify-content: space-between;
        background: linear-gradient(135deg, #10B981, #059669); color: #fff;
      }
      #linguaai-panel .lp-title { font-weight: 700; font-size: 15px; }
      #linguaai-panel .lp-close { cursor: pointer; font-size: 18px; opacity: 0.8; line-height: 1; }
      #linguaai-panel .lp-close:hover { opacity: 1; }
      #linguaai-panel .lp-tabs {
        display: flex; border-bottom: 1px solid #F1F5F9; overflow-x: auto;
      }
      #linguaai-panel .lp-tab {
        padding: 8px 12px; cursor: pointer; font-size: 12px; font-weight: 600;
        color: #64748B; white-space: nowrap; border-bottom: 2px solid transparent;
        transition: all 0.15s;
      }
      #linguaai-panel .lp-tab:hover { color: #10B981; }
      #linguaai-panel .lp-tab.active { color: #10B981; border-bottom-color: #10B981; }
      #linguaai-panel .lp-body { overflow-y: auto; max-height: 360px; padding: 8px; }
      #linguaai-panel .lp-section { display: none; }
      #linguaai-panel .lp-section.active { display: block; }

      #linguaai-panel .lp-empty { padding: 24px 16px; text-align: center; color: #94A3B8; }
      #linguaai-panel .lp-issue {
        padding: 10px 12px; border-radius: 10px; margin: 4px 0;
        background: #F8FAFC; border: 1px solid #E2E8F0;
      }
      #linguaai-panel .lp-issue:hover { border-color: #10B981; }
      #linguaai-panel .lp-issue-badge {
        display: inline-block; font-size: 10px; font-weight: 700;
        padding: 2px 8px; border-radius: 6px; margin-bottom: 4px;
      }
      #linguaai-panel .lp-issue-fix { margin: 4px 0; line-height: 1.5; }
      #linguaai-panel .lp-issue-orig { color: #EF4444; text-decoration: line-through; }
      #linguaai-panel .lp-issue-new { color: #16A34A; font-weight: 500; }
      #linguaai-panel .lp-issue-explain { color: #64748B; font-size: 12px; margin-top: 4px; }
      #linguaai-panel .lp-issue-actions { display: flex; gap: 6px; margin-top: 6px; }
      #linguaai-panel .lp-btn {
        padding: 4px 10px; border-radius: 6px; border: none; cursor: pointer;
        font-size: 11px; font-weight: 600;
      }
      #linguaai-panel .lp-btn-accept { background: #10B981; color: #fff; }
      #linguaai-panel .lp-btn-accept:hover { background: #059669; }
      #linguaai-panel .lp-btn-ignore { background: #F1F5F9; color: #64748B; }
      #linguaai-panel .lp-btn-ignore:hover { background: #E2E8F0; }
      #linguaai-panel .lp-btn-dict { background: #EDE9FE; color: #7C3AED; }
      #linguaai-panel .lp-btn-dict:hover { background: #DDD6FE; }

      #linguaai-panel .lp-rewrite-area { padding: 12px; }
      #linguaai-panel .lp-rewrite-input {
        width: 100%; min-height: 60px; padding: 8px 10px;
        border: 1px solid #E2E8F0; border-radius: 8px; font-size: 13px;
        font-family: inherit; resize: vertical; outline: none;
      }
      #linguaai-panel .lp-rewrite-input:focus { border-color: #10B981; }
      #linguaai-panel .lp-tone-grid {
        display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; padding: 8px;
      }
      #linguaai-panel .lp-tone-btn {
        padding: 8px; border-radius: 8px; border: 1px solid #E2E8F0;
        background: #fff; cursor: pointer; font-size: 12px; font-weight: 500;
        text-align: center; transition: all 0.15s;
      }
      #linguaai-panel .lp-tone-btn:hover { border-color: #10B981; background: #ECFDF5; }

      #linguaai-panel .lp-compose-area { padding: 12px; }
      #linguaai-panel .lp-compose-input {
        width: 100%; min-height: 50px; padding: 8px 10px;
        border: 1px solid #E2E8F0; border-radius: 8px; font-size: 13px;
        font-family: inherit; resize: vertical; outline: none;
      }
      #linguaai-panel .lp-compose-input:focus { border-color: #10B981; }
      #linguaai-panel .lp-compose-result {
        margin-top: 8px; padding: 10px; background: #ECFDF5; border-radius: 8px;
        border: 1px solid #10B981; font-size: 13px; line-height: 1.5; white-space: pre-wrap;
        max-height: 200px; overflow-y: auto;
      }

      #linguaai-panel .lp-chat-area { padding: 8px 12px; display: flex; flex-direction: column; }
      #linguaai-panel .lp-chat-log {
        flex: 1; overflow-y: auto; max-height: 260px; min-height: 80px;
      }
      #linguaai-panel .lp-chat-msg {
        margin: 4px 0; padding: 6px 10px; border-radius: 8px; font-size: 12px; line-height: 1.4;
      }
      #linguaai-panel .lp-chat-msg.user { background: #10B981; color: #fff; margin-left: 24px; }
      #linguaai-panel .lp-chat-msg.ai { background: #F1F5F9; color: #1E293B; margin-right: 24px; }
      #linguaai-panel .lp-chat-input-row { display: flex; gap: 6px; margin-top: 8px; }
      #linguaai-panel .lp-chat-input {
        flex: 1; padding: 6px 8px; border: 1px solid #E2E8F0; border-radius: 6px;
        font-size: 12px; font-family: inherit; outline: none;
      }
      #linguaai-panel .lp-chat-input:focus { border-color: #10B981; }
      #linguaai-panel .lp-chat-send {
        padding: 6px 12px; border-radius: 6px; border: none; cursor: pointer;
        background: #10B981; color: #fff; font-size: 12px; font-weight: 600;
      }

      #linguaai-panel .lp-score-row {
        display: flex; align-items: center; gap: 12px; padding: 12px 16px;
      }
      #linguaai-panel .lp-score-ring {
        width: 48px; height: 48px; border-radius: 50%; border: 3px solid #10B981;
        display: flex; align-items: center; justify-content: center;
        font-size: 16px; font-weight: 700; color: #10B981; flex-shrink: 0;
      }
      #linguaai-panel .lp-score-info { flex: 1; }
      #linguaai-panel .lp-score-label { font-weight: 700; font-size: 13px; color: #1E293B; }
      #linguaai-panel .lp-score-sub { font-size: 11px; color: #64748B; }

      #linguaai-panel .lp-action-btn {
        width: 100%; padding: 10px; border-radius: 8px; border: none; cursor: pointer;
        background: #10B981; color: #fff; font-size: 13px; font-weight: 600; margin-top: 8px;
      }
      #linguaai-panel .lp-action-btn:hover { background: #059669; }
      #linguaai-panel .lp-action-btn.secondary { background: #F1F5F9; color: #475569; }
      #linguaai-panel .lp-action-btn.secondary:hover { background: #E2E8F0; }
      #linguaai-panel .lp-spinner {
        width: 18px; height: 18px; border: 2px solid #E2E8F0;
        border-top-color: #10B981; border-radius: 50%;
        animation: linguaai-spin 0.8s linear infinite; margin: 14px auto;
      }
      @keyframes linguaai-spin { to { transform: rotate(360deg); } }

      #linguaai-card {
        position: fixed; z-index: 2147483647;
        width: 320px; max-height: 420px; overflow-y: auto;
        background: #fff; border: 1px solid #E5E7EB; border-radius: 12px;
        box-shadow: 0 12px 32px rgba(0,0,0,0.18);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px; color: #111827; display: none;
      }
      #linguaai-card .lc-header {
        padding: 10px 12px; border-bottom: 1px solid #F3F4F6;
        font-weight: 600; display: flex; align-items: center; justify-content: space-between;
      }
      #linguaai-card .lc-body { padding: 6px 8px; }
      #linguaai-card .lc-empty { padding: 16px 12px; text-align: center; color: #6B7280; }
      #linguaai-card .lc-issue {
        padding: 8px 10px; border-radius: 8px; margin: 4px 0; background: #F9FAFB;
        border: 1px solid #EEF0F2;
      }
      #linguaai-card .lc-badge {
        display: inline-block; font-size: 11px; font-weight: 600;
        padding: 1px 6px; border-radius: 6px; margin-bottom: 4px;
      }
      #linguaai-card .lc-fix { margin: 4px 0; line-height: 1.4; }
      #linguaai-card .lc-orig { color: #EF4444; text-decoration: line-through; }
      #linguaai-card .lc-new { color: #16A34A; font-weight: 500; }
      #linguaai-card .lc-explain { color: #6B7280; font-size: 12px; margin-top: 4px; }
      #linguaai-card .lc-actions { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
      #linguaai-card .lc-btn {
        padding: 4px 10px; border-radius: 6px; border: none; cursor: pointer;
        font-size: 11px; font-weight: 600;
      }
      #linguaai-card .lc-accept { background: #4F46E5; color: #fff; }
      #linguaai-card .lc-accept:hover { background: #4338CA; }
      #linguaai-card .lc-ignore { background: #F3F4F6; color: #6B7280; }
      #linguaai-card .lc-ignore:hover { background: #E5E7EB; }
      #linguaai-card .lc-dict { background: #EDE9FE; color: #7C3AED; }
      #linguaai-card .lc-close { cursor: pointer; color: #9CA3AF; font-size: 16px; line-height: 1; padding: 0 4px; }
      #linguaai-card .lc-spinner {
        width: 18px; height: 18px; border: 2px solid #E5E7EB;
        border-top-color: #6366F1; border-radius: 50%;
        animation: linguaai-spin 0.8s linear infinite; margin: 14px auto;
      }

      #linguaai-selection-toolbar {
        position: fixed; z-index: 2147483647; display: none;
        background: #1E293B; border-radius: 8px; padding: 4px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.25);
        gap: 2px;
      }
      #linguaai-selection-toolbar .lst-btn {
        padding: 6px 10px; border-radius: 6px; border: none; cursor: pointer;
        background: transparent; color: #E2E8F0; font-size: 12px; font-weight: 500;
        font-family: -apple-system, sans-serif; white-space: nowrap;
      }
      #linguaai-selection-toolbar .lst-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
      #linguaai-selection-toolbar .lst-sep { width: 1px; background: rgba(255,255,255,0.15); margin: 4px 2px; }

      #linguaai-compose-panel {
        position: fixed; z-index: 2147483647; display: none;
        width: 380px; background: #fff; border-radius: 16px;
        box-shadow: 0 16px 48px rgba(0,0,0,0.18); overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px; color: #1E293B;
      }
      #linguaai-compose-panel .cp-header {
        padding: 12px 16px; background: linear-gradient(135deg, #10B981, #059669); color: #fff;
        display: flex; justify-content: space-between; align-items: center;
      }
      #linguaai-compose-panel .cp-title { font-weight: 700; }
      #linguaai-compose-panel .cp-close { cursor: pointer; font-size: 18px; opacity: 0.8; }
      #linguaai-compose-panel .cp-body { padding: 16px; }
      #linguaai-compose-panel .cp-input {
        width: 100%; min-height: 60px; padding: 10px; border: 1px solid #E2E8F0;
        border-radius: 8px; font-size: 13px; font-family: inherit; resize: vertical; outline: none;
      }
      #linguaai-compose-panel .cp-input:focus { border-color: #10B981; }
      #linguaai-compose-panel .cp-result {
        margin-top: 12px; padding: 12px; background: #ECFDF5; border-radius: 8px;
        border: 1px solid #10B981; font-size: 13px; line-height: 1.5; white-space: pre-wrap;
        max-height: 200px; overflow-y: auto; display: none;
      }
      #linguaai-compose-panel .cp-actions { display: flex; gap: 8px; margin-top: 12px; }
      #linguaai-compose-panel .cp-btn {
        padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer;
        font-size: 12px; font-weight: 600;
      }
      #linguaai-compose-panel .cp-btn-primary { background: #10B981; color: #fff; }
      #linguaai-compose-panel .cp-btn-primary:hover { background: #059669; }
      #linguaai-compose-panel .cp-btn-secondary { background: #F1F5F9; color: #475569; }
      #linguaai-compose-panel .cp-btn-secondary:hover { background: #E2E8F0; }
      #linguaai-compose-panel .cp-spinner {
        width: 18px; height: 18px; border: 2px solid #E2E8F0;
        border-top-color: #10B981; border-radius: 50%;
        animation: linguaai-spin 0.8s linear infinite; margin: 14px auto;
      }

      .linguaai-mark { cursor: pointer; border-bottom-style: wavy; border-bottom-width: 2px; }
    `;
    document.head.appendChild(st);
  }
