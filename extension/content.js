// LinguaAI content script — working version
// Detects text fields, shows floating button, analyzes text, shows suggestions
if (window.__linguaaiInjected) { /* already loaded */ }
window.__linguaaiInjected = true;

var floatingButton = null;
var assistantPanel = null;
var debounceTimer = null;
var lastAnalyzedText = "";
var activeTarget = null;
var activeIssues = [];
var isEnabled = true;
var settings = {};

var VALID_INPUTS = 'textarea, input[type="text"], input[type="email"], input[type="url"], [contenteditable="true"], [contenteditable=""]';
var SKIP_INPUTS = 'input[type="password"], input[type="number"], input[type="tel"], input[type="hidden"], input[type="date"], input[type="time"]';

var CATEGORY_STYLES = {
  grammar: { color: '#EF4444', label: 'Grammar' },
  spelling: { color: '#EF4444', label: 'Spelling' },
  punctuation: { color: '#EF4444', label: 'Punctuation' },
  clarity: { color: '#F59E0B', label: 'Clarity' },
  style: { color: '#F59E0B', label: 'Style' },
  vocabulary: { color: '#3B82F6', label: 'Vocabulary' },
  tone: { color: '#8B5CF6', label: 'Tone' },
  default: { color: '#10B981', label: 'Suggestion' },
};

function getCategoryStyle(type) {
  var t = (type || '').toLowerCase();
  for (var key of Object.keys(CATEGORY_STYLES)) {
    if (t.includes(key)) return CATEGORY_STYLES[key];
  }
  return CATEGORY_STYLES.default;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
}

function classifyField(target) {
  if (!target) return 'unknown';
  var type = (target.type || '').toLowerCase();
  if (type === 'password' || type === 'number' || type === 'tel' || type === 'hidden') return 'skip';
  if (target.matches(SKIP_INPUTS)) return 'skip';
  return 'text';
}

function getTargetText(target) {
  if (!target) return '';
  if (target.isContentEditable) return (target.innerText || target.textContent || '').trim();
  return (target.value || '').trim();
}

function setTargetText(target, text) {
  if (!target) return;
  if (target.isContentEditable) {
    target.innerText = text;
    target.dispatchEvent(new InputEvent('input', { bubbles: true }));
  } else {
    target.value = text;
    target.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }
}

function showToast(msg) {
  var existing = document.getElementById('linguaai-toast');
  if (existing) existing.remove();
  var toast = document.createElement('div');
  toast.id = 'linguaai-toast';
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483649;background:#1E293B;color:#fff;padding:10px 20px;border-radius:8px;font:13px -apple-system,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,0.3);opacity:0;transition:opacity 0.2s;';
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(function() { toast.style.opacity = '1'; });
  setTimeout(function() { toast.style.opacity = '0'; setTimeout(function() { toast.remove(); }, 200); }, 2500);
}

function ensureStyles() {
  if (document.getElementById('linguaai-styles')) return;
  var st = document.createElement('style');
  st.id = 'linguaai-styles';
  st.textContent = '\
    #linguaai-fab { position:fixed;z-index:2147483646;width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#10B981,#059669);box-shadow:0 4px 14px rgba(16,185,129,0.4);cursor:pointer;display:none;align-items:center;justify-content:center;transition:transform 0.15s; }\
    #linguaai-fab:hover { transform:scale(1.1); }\
    #linguaai-fab .fab-badge { position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;border-radius:9px;background:#EF4444;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;font-family:sans-serif;padding:0 4px; }\
    #linguaai-panel { position:fixed;z-index:2147483647;width:320px;max-height:440px;background:#fff;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,0.18);font-family:-apple-system,sans-serif;font-size:13px;color:#1E293B;display:none;flex-direction:column;overflow:hidden; }\
    #linguaai-panel .lp-header { padding:12px 16px;border-bottom:1px solid #F1F5F9;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,#10B981,#059669);color:#fff; }\
    #linguaai-panel .lp-title { font-weight:700;font-size:15px; }\
    #linguaai-panel .lp-close { cursor:pointer;font-size:18px;opacity:0.8; }\
    #linguaai-panel .lp-body { overflow-y:auto;max-height:360px;padding:8px; }\
    #linguaai-panel .lp-empty { padding:24px 16px;text-align:center;color:#94A3B8; }\
    #linguaai-panel .lp-issue { padding:10px 12px;border-radius:10px;margin:4px 0;background:#F8FAFC;border:1px solid #E2E8F0; }\
    #linguaai-panel .lp-issue:hover { border-color:#10B981; }\
    #linguaai-panel .lp-badge { display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;margin-bottom:4px; }\
    #linguaai-panel .lp-fix { margin:4px 0;line-height:1.5; }\
    #linguaai-panel .lp-orig { color:#EF4444;text-decoration:line-through; }\
    #linguaai-panel .lp-new { color:#16A34A;font-weight:500; }\
    #linguaai-panel .lp-explain { color:#64748B;font-size:12px;margin-top:4px; }\
    #linguaai-panel .lp-btn { padding:4px 10px;border-radius:6px;border:none;cursor:pointer;font-size:11px;font-weight:600;margin-right:6px; }\
    #linguaai-panel .lp-btn-accept { background:#10B981;color:#fff; }\
    #linguaai-panel .lp-btn-ignore { background:#F1F5F9;color:#64748B; }\
    #linguaai-panel .lp-score { display:flex;align-items:center;gap:12px;padding:12px 16px; }\
    #linguaai-panel .lp-score-ring { width:48px;height:48px;border-radius:50%;border:3px solid #10B981;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#10B981; }\
    #linguaai-panel .lp-action { width:100%;padding:10px;border-radius:8px;border:none;cursor:pointer;background:#10B981;color:#fff;font-size:13px;font-weight:600;margin-top:8px; }\
    #linguaai-panel .lp-spinner { width:24px;height:24px;border:3px solid #E2E8F0;border-top-color:#10B981;border-radius:50%;animation:linguaai-spin 0.8s linear infinite;margin:20px auto; }\
    @keyframes linguaai-spin { to { transform:rotate(360deg); } }\
  ';
  document.head.appendChild(st);
}

function ensureButton() {
  if (floatingButton && document.body.contains(floatingButton)) return;
  floatingButton = document.createElement('div');
  floatingButton.id = 'linguaai-fab';
  floatingButton.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg><span class="fab-badge" style="display:none">0</span>';
  floatingButton.addEventListener('click', function() {
    if (assistantPanel && assistantPanel.style.display === 'flex') {
      assistantPanel.style.display = 'none';
    } else {
      analyzeCurrent();
    }
  });
  document.body.appendChild(floatingButton);
}

function ensurePanel() {
  if (assistantPanel && document.body.contains(assistantPanel)) return;
  assistantPanel = document.createElement('div');
  assistantPanel.id = 'linguaai-panel';
  assistantPanel.innerHTML = '\
    <div class="lp-header">\
      <span class="lp-title">LinguaAI</span>\
      <span class="lp-close">&times;</span>\
    </div>\
    <div class="lp-body"></div>\
  ';
  assistantPanel.querySelector('.lp-close').addEventListener('click', function() {
    assistantPanel.style.display = 'none';
  });
  document.body.appendChild(assistantPanel);
}

function positionFab(target) {
  if (!floatingButton || !target) return;
  var rect = target.getBoundingClientRect();
  floatingButton.style.display = 'flex';
  floatingButton.style.left = Math.min(rect.right - 40, window.innerWidth - 50) + 'px';
  floatingButton.style.top = Math.max(rect.top + 8, 8) + 'px';
}

function analyzeCurrent() {
  if (!activeTarget) return;
  var text = getTargetText(activeTarget);
  if (text.trim().length < 3) return;

  var body = assistantPanel.querySelector('.lp-body');
  body.innerHTML = '<div class="lp-spinner"></div>';
  assistantPanel.style.display = 'flex';

  var rect = activeTarget.getBoundingClientRect();
  var panelWidth = 320;
  var left = Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 16);
  var top = Math.max(rect.bottom + 8, 8);
  if (top + 440 > window.innerHeight) top = Math.max(8, rect.top - 440);
  assistantPanel.style.left = left + 'px';
  assistantPanel.style.top = top + 'px';

  chrome.runtime.sendMessage({ type: 'LINGUAAI_ANALYZE', text: text, mode: 'full' }, function(response) {
    if (chrome.runtime.lastError) {
      body.innerHTML = '<div class="lp-empty">Error: ' + escapeHtml(chrome.runtime.lastError.message) + '</div>';
      return;
    }
    if (!response || !response.ok) {
      body.innerHTML = '<div class="lp-empty">' + escapeHtml(response?.error || 'Analysis failed') + '</div>';
      return;
    }

    var data = response.data;
    activeIssues = data.issues || [];

    var score = data.overallScore || 100;
    var scoreColor = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444';

    var html = '<div class="lp-score"><div class="lp-score-ring" style="border-color:' + scoreColor + ';color:' + scoreColor + '">' + score + '</div><div><div style="font-weight:700;font-size:14px">Writing Score</div><div style="font-size:12px;color:#64748B">' + activeIssues.length + ' issue' + (activeIssues.length !== 1 ? 's' : '') + '</div></div></div>';

    if (activeIssues.length === 0) {
      html += '<div class="lp-empty">All clear! No issues found.</div>';
    } else {
      for (var i = 0; i < activeIssues.length; i++) {
        var issue = activeIssues[i];
        var style = getCategoryStyle(issue.type);
        html += '<div class="lp-issue" data-idx="' + i + '">';
        html += '<span class="lp-badge" style="background:' + style.bg || 'rgba(16,185,129,0.1)' + ';color:' + style.color + '">' + escapeHtml(style.label) + '</span>';
        html += '<div class="lp-fix"><span class="lp-orig">' + escapeHtml(issue.original) + '</span> &rarr; <span class="lp-new">' + escapeHtml(issue.suggestion) + '</span></div>';
        if (issue.explanation) html += '<div class="lp-explain">' + escapeHtml(issue.explanation) + '</div>';
        html += '<div style="margin-top:6px"><button class="lp-btn lp-btn-accept" data-action="accept">Accept</button><button class="lp-btn lp-btn-ignore" data-action="ignore">Ignore</button></div>';
        html += '</div>';
      }
      html += '<button class="lp-action" id="lp-accept-all">Accept all fixes</button>';
    }

    body.innerHTML = html;

    var badge = floatingButton.querySelector('.fab-badge');
    if (activeIssues.length > 0) {
      badge.textContent = activeIssues.length;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }

    body.querySelectorAll('.lp-issue').forEach(function(card) {
      var idx = parseInt(card.dataset.idx);
      card.querySelector('[data-action="accept"]').addEventListener('click', function() {
        var issue = activeIssues[idx];
        var current = getTargetText(activeTarget);
        var pos = current.indexOf(issue.original);
        if (pos >= 0) {
          var newText = current.slice(0, pos) + issue.suggestion + current.slice(pos + issue.original.length);
          setTargetText(activeTarget, newText);
          card.style.opacity = '0.4';
          showToast('Fixed');
        }
      });
      card.querySelector('[data-action="ignore"]').addEventListener('click', function() {
        card.style.display = 'none';
      });
    });

    var acceptAll = body.querySelector('#lp-accept-all');
    if (acceptAll) {
      acceptAll.addEventListener('click', function() {
        if (data.correctedText && data.correctedText !== text) {
          setTargetText(activeTarget, data.correctedText);
          showToast('All fixes applied');
          assistantPanel.style.display = 'none';
        }
      });
    }
  });
}

function scheduleAnalyze() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(function() {
    if (activeTarget) {
      var text = getTargetText(activeTarget);
      if (text.trim().length >= 3) {
        analyzeCurrent();
      }
    }
  }, 1500);
}

// Event listeners
document.addEventListener('focusin', function(e) {
  var target = e.target;
  if (!target || !target.matches) return;
  if (!target.matches(VALID_INPUTS)) return;
  if (classifyField(target) === 'skip') return;

  activeTarget = target;
  positionFab(target);

  // Quick analyze on focus
  var text = getTargetText(target);
  if (text.trim().length >= 3) {
    scheduleAnalyze();
  }
});

document.addEventListener('input', function(e) {
  var target = e.target;
  if (!target || target !== activeTarget) return;
  scheduleAnalyze();
});

// Selection toolbar
document.addEventListener('mouseup', function(e) {
  var selection = window.getSelection().toString().trim();
  if (selection.length < 3) return;

  // Show floating button near selection
  if (floatingButton) {
    var rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
    floatingButton.style.display = 'flex';
    floatingButton.style.left = Math.min(rect.right - 40, window.innerWidth - 50) + 'px';
    floatingButton.style.top = Math.max(rect.top - 44, 8) + 'px';
  }
});

// Keyboard shortcut: Ctrl+Shift+L to check selection
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') {
    e.preventDefault();
    var selection = window.getSelection().toString().trim();
    if (selection.length >= 3) {
      if (!activeTarget) {
        activeTarget = document.activeElement;
      }
      // Create a temporary analysis
      var body = assistantPanel ? assistantPanel.querySelector('.lp-body') : null;
      if (!body) {
        ensurePanel();
        body = assistantPanel.querySelector('.lp-body');
      }
      body.innerHTML = '<div class="lp-spinner"></div>';
      assistantPanel.style.display = 'flex';
      assistantPanel.style.left = '50px';
      assistantPanel.style.top = '50px';

      chrome.runtime.sendMessage({ type: 'LINGUAAI_ANALYZE', text: selection, mode: 'full' }, function(response) {
        if (!response || !response.ok) {
          body.innerHTML = '<div class="lp-empty">' + escapeHtml(response?.error || 'Analysis failed') + '</div>';
          return;
        }
        var data = response.data;
        activeIssues = data.issues || [];
        var html = '<div class="lp-score"><div class="lp-score-ring" style="border-color:#10B981;color:#10B981">' + (data.overallScore || 100) + '</div><div><div style="font-weight:700">Selection Analysis</div><div style="font-size:12px;color:#64748B">' + activeIssues.length + ' issue' + (activeIssues.length !== 1 ? 's' : '') + '</div></div></div>';
        if (activeIssues.length === 0) {
          html += '<div class="lp-empty">All clear!</div>';
        } else {
          for (var i = 0; i < activeIssues.length; i++) {
            var issue = activeIssues[i];
            var style = getCategoryStyle(issue.type);
            html += '<div class="lp-issue"><span class="lp-badge" style="color:' + style.color + '">' + escapeHtml(style.label) + '</span><div class="lp-fix"><span class="lp-orig">' + escapeHtml(issue.original) + '</span> &rarr; <span class="lp-new">' + escapeHtml(issue.suggestion) + '</span></div>' + (issue.explanation ? '<div class="lp-explain">' + escapeHtml(issue.explanation) + '</div>' : '') + '</div>';
          }
        }
        body.innerHTML = html;
      });
    }
  }
});

// Listen for settings updates
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type === 'LINGUAAI_SETTINGS_UPDATED') {
    chrome.storage.sync.get({ enabled: true }, function(result) {
      isEnabled = result.enabled;
      if (!isEnabled) {
        floatingButton.style.display = 'none';
        assistantPanel.style.display = 'none';
      }
    });
  }
  if (msg.type === 'LINGUAAI_CHECK_SELECTION') {
    var selection = window.getSelection().toString().trim();
    if (selection.length >= 3) {
      sendResponse({ text: selection });
    }
  }
  if (msg.type === 'LINGUAAI_UNDO') {
    showToast('Undo not available in this version');
  }
  return false;
});

// Init
chrome.storage.sync.get({ enabled: true, autoCheck: true }, function(result) {
  isEnabled = result.enabled;
  if (isEnabled) {
    ensureStyles();
    ensureButton();
    ensurePanel();
  }
});
