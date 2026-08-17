  // ── Apply a single suggestion ──
  function applySuggestion(issue) {
    if (!activeTarget || !issue) return;
    const current = getTargetText(activeTarget);
    const pos = current.indexOf(issue.original);
    if (pos < 0) { showToast('Text not found'); return; }
    const newText = current.slice(0, pos) + issue.suggestion + current.slice(pos + issue.original.length);
    setTargetText(activeTarget, newText);
    showToast('Fixed');
    lastAnalyzedText = getTargetText(activeTarget);
    setTimeout(() => { if (activeTarget) analyzeAndShowCard(activeTarget, false); }, 300);
  }

  // ── Analyze ──
  function analyzeAndShowCard(target, force) {
    const text = getTargetText(target);
    if (!text) return;
    if (!force && text === lastAnalyzedText) return;
    lastAnalyzedText = text;
    const context = getContext(target, text);
    const card = ensureCard();
    if (activeTarget) positionCard(activeTarget.getBoundingClientRect());
    card.innerHTML = `
      <div class="lc-header">
        <span>LinguaAI</span>
        <span class="lc-close" title="close">\u00d7</span>
      </div>
      <div class="lc-body">
        <div class="lc-spinner"></div>
        <div style="text-align:center;color:#6B7280;font-size:12px;">Analyzing your text\u2026</div>
      </div>`;
    card.style.display = 'block';
    const closeBtn = card.querySelector('.lc-close');
    if (closeBtn) closeBtn.addEventListener('click', hideCard);
    const btn = floatingButton;
    if (btn) btn.classList.add('linguaai-loading');
    chrome.runtime.sendMessage({ type: 'LINGUAAI_ANALYZE', text, mode: 'full', context }, (resp) => {
      if (btn) btn.classList.remove('linguaai-loading');
      if (!resp || !resp.ok) {
        card.innerHTML = `
          <div class="lc-header">
            <span>LinguaAI</span>
            <span class="lc-close" title="close">\u00d7</span>
          </div>
          <div class="lc-body">
            <div class="lc-empty">${escapeHtml((resp && resp.error) || 'Analysis failed')}</div>
          </div>`;
        card.style.display = 'block';
        const cb = card.querySelector('.lc-close');
        if (cb) cb.addEventListener('click', hideCard);
        return;
      }
      activeIssues = (resp.data && resp.data.issues) || [];
      activeIssues = activeIssues.filter(i => {
        if (!i || !i.original) return false;
        const key = `${i.original}::${i.suggestion}`;
        if (ignoredSuggestions.has(key)) return false;
        if (i.type && i.type.toLowerCase().includes('spelling') && customDictionary.includes(i.original)) return false;
        return true;
      });
      renderCardContent(target, resp.data);
      applyHighlights(target, activeIssues);
      showFabBadge(activeIssues.length);
      updatePanelIssues(resp.data);
    });
  }

  function renderCardContent(target, data) {
    const card = ensureCard();
    const issues = (data.issues || []).filter(i => i && i.original && i.suggestion);
    applyHighlights(target, issues);
    if (issues.length === 0) {
      card.innerHTML = `
        <div class="lc-header">
          <span>LinguaAI</span>
          <span class="lc-close" title="close">\u00d7</span>
        </div>
        <div class="lc-body">
          <div class="lc-empty">\u2705 All clear! No issues detected.</div>
        </div>`;
      card.style.display = 'block';
      const cb = card.querySelector('.lc-close');
      if (cb) cb.addEventListener('click', hideCard);
      return;
    }
    let bodyHtml = issues.map((issue, idx) => {
      const catStyle = getCategoryStyle(issue.type);
      return `
        <div class="lc-issue" data-idx="${idx}">
          <span class="lc-badge" style="background:${catStyle.bg};color:${catStyle.color};">${escapeHtml(issue.type || 'suggestion')}</span>
          <div class="lc-fix">
            <span class="lc-orig">${escapeHtml(issue.original)}</span>
            \u2192
            <span class="lc-new">${escapeHtml(issue.suggestion)}</span>
          </div>
          ${issue.explanation ? `<div class="lc-explain">${escapeHtml(issue.explanation)}</div>` : ''}
          <div class="lc-actions">
            <button class="lc-btn lc-accept" data-idx="${idx}">Replace</button>
            <button class="lc-btn lc-ignore" data-idx="${idx}">Ignore</button>
            <button class="lc-btn lc-dict" data-idx="${idx}">Add to dict</button>
          </div>
        </div>`;
    }).join('');
    if (data.correctedText && data.correctedText !== getTargetText(target)) {
      bodyHtml = `<button class="lc-btn lc-accept" id="lcAcceptAll" style="width:100%;margin-bottom:6px;">Accept all fixes</button>` + bodyHtml;
    }
    card.innerHTML = `
      <div class="lc-header">
        <span>LinguaAI \u00b7 ${issues.length} issue${issues.length === 1 ? '' : 's'}</span>
        <span class="lc-close" title="close">\u00d7</span>
      </div>
      <div class="lc-body">${bodyHtml}</div>`;
    card.style.display = 'block';
    const cb = card.querySelector('.lc-close');
    if (cb) cb.addEventListener('click', hideCard);
    const acceptAll = card.querySelector('#lcAcceptAll');
    if (acceptAll) {
      acceptAll.addEventListener('click', () => {
        if (data.correctedText) {
          setTargetText(target, data.correctedText);
          showToast('All fixes applied');
          lastAnalyzedText = getTargetText(target);
          hideCard();
          setTimeout(() => { if (target) analyzeAndShowCard(target, false); }, 300);
        }
      });
    }
    card.querySelectorAll('.lc-accept[data-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const issue = issues[idx];
        if (!issue) return;
        applySuggestion(issue);
        btn.closest('.lc-issue').style.opacity = '0.4';
        btn.disabled = true;
        btn.textContent = 'Applied';
      });
    });
    card.querySelectorAll('.lc-ignore[data-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const issue = issues[idx];
        if (!issue) return;
        const key = `${issue.original}::${issue.suggestion}`;
        ignoredSuggestions.add(key);
        chrome.storage.sync.set({ ignoredSuggestions: Array.from(ignoredSuggestions) });
        btn.closest('.lc-issue').style.opacity = '0.3';
        btn.disabled = true;
        showToast('Ignored');
      });
    });
    card.querySelectorAll('.lc-dict[data-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const issue = issues[idx];
        if (!issue) return;
        if (!customDictionary.includes(issue.original)) {
          customDictionary.push(issue.original);
          chrome.storage.sync.set({ customDictionary });
          btn.closest('.lc-issue').style.opacity = '0.3';
          btn.disabled = true;
          showToast(`"${issue.original}" added to dictionary`);
        }
      });
    });
  }

  // ── Update panel issues ──
  function updatePanelIssues(data) {
    const panel = assistantPanel;
    if (!panel) return;
    const scoreRing = panel.querySelector('#lpScoreRing');
    const scoreLabel = panel.querySelector('#lpScoreLabel');
    const scoreSub = panel.querySelector('#lpScoreSub');
    const issuesEl = panel.querySelector('#lpIssues');
    const score = typeof data.overallScore === 'number' ? data.overallScore : 100;
    const issues = (data.issues || []).filter(i => i && i.original && i.suggestion);
    if (scoreRing) {
      scoreRing.textContent = score;
      const color = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444';
      scoreRing.style.borderColor = color;
      scoreRing.style.color = color;
    }
    if (scoreLabel) scoreLabel.textContent = 'Writing Score';
    if (scoreSub) {
      const tone = data.tone || '\u2014';
      scoreSub.textContent = `${issues.length} issue${issues.length === 1 ? '' : 's'}  \u00b7  Tone: ${tone}`;
    }
    if (!issuesEl) return;
    if (issues.length === 0) {
      issuesEl.innerHTML = '<div class="lp-empty">\u2705 All clear! No issues found.</div>';
      return;
    }
    issuesEl.innerHTML = issues.map((issue, idx) => {
      const catStyle = getCategoryStyle(issue.type);
      return `
        <div class="lp-issue" data-idx="${idx}">
          <span class="lp-issue-badge" style="background:${catStyle.bg};color:${catStyle.color};">${escapeHtml(issue.type || 'suggestion')}</span>
          <div class="lp-issue-fix">
            <span class="lp-issue-orig">${escapeHtml(issue.original)}</span>
            \u2192
            <span class="lp-issue-new">${escapeHtml(issue.suggestion)}</span>
          </div>
          ${issue.explanation ? `<div class="lp-issue-explain">${escapeHtml(issue.explanation)}</div>` : ''}
          <div class="lp-issue-actions">
            <button class="lp-btn lp-btn-accept" data-idx="${idx}">Replace</button>
            <button class="lp-btn lp-btn-ignore" data-idx="${idx}">Ignore</button>
            <button class="lp-btn lp-btn-dict" data-idx="${idx}">Add to dict</button>
          </div>
        </div>`;
    }).join('');
    issuesEl.querySelectorAll('.lp-btn-accept').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const issue = issues[idx];
        if (issue) applySuggestion(issue);
        btn.closest('.lp-issue').style.opacity = '0.4';
        btn.disabled = true;
      });
    });
    issuesEl.querySelectorAll('.lp-btn-ignore').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const issue = issues[idx];
        if (issue) {
          const key = `${issue.original}::${issue.suggestion}`;
          ignoredSuggestions.add(key);
          chrome.storage.sync.set({ ignoredSuggestions: Array.from(ignoredSuggestions) });
        }
        btn.closest('.lp-issue').style.opacity = '0.3';
        btn.disabled = true;
      });
    });
    issuesEl.querySelectorAll('.lp-btn-dict').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const issue = issues[idx];
        if (issue && !customDictionary.includes(issue.original)) {
          customDictionary.push(issue.original);
          chrome.storage.sync.set({ customDictionary });
          btn.closest('.lp-issue').style.opacity = '0.3';
          btn.disabled = true;
          showToast(`"${issue.original}" added to dictionary`);
        }
      });
    });
  }

  // ── Rewrite ──
  function doRewrite(text, action) {
    if (!text || !settings.enableAI) { showToast('AI features disabled'); return; }
    const panel = ensurePanel();
    panel.querySelector('.lp-tab[data-tab="rewrite"]').click();
    const resultEl = panel.querySelector('#lpRewriteResult');
    resultEl.innerHTML = '<div class="lp-spinner"></div>';
    resultEl.style.display = 'block';
    chrome.runtime.sendMessage({ type: 'LINGUAAI_REWRITE', text, action }, (resp) => {
      if (resp && resp.ok && resp.data) {
        const result = resp.data.result || resp.data.correctedText || 'No result';
        resultEl.innerHTML = `
          <div style="padding:12px;background:#ECFDF5;border-radius:8px;border:1px solid #10B981;font-size:13px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(result)}</div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button class="lp-btn lp-btn-accept" id="lpRewriteReplace">Replace</button>
            <button class="lp-btn lp-btn-secondary" id="lpRewriteCopy">Copy</button>
            <button class="lp-btn lp-btn-ignore" id="lpRewriteClose">Close</button>
          </div>`;
        document.getElementById('lpRewriteReplace')?.addEventListener('click', () => {
          if (activeTarget) {
            const sel = window.getSelection();
            if (sel && sel.toString().trim()) {
              const current = getTargetText(activeTarget);
              const newText = current.replace(sel.toString().trim(), result);
              setTargetText(activeTarget, newText);
            } else {
              setTargetText(activeTarget, result);
            }
            showToast('Replaced');
          }
        });
        document.getElementById('lpRewriteCopy')?.addEventListener('click', () => {
          navigator.clipboard.writeText(result).then(() => showToast('Copied'));
        });
        document.getElementById('lpRewriteClose')?.addEventListener('click', () => {
          resultEl.style.display = 'none';
        });
      } else {
        resultEl.innerHTML = `<div style="color:#EF4444;">Rewrite failed: ${escapeHtml(resp ? resp.error : 'Network error')}</div>`;
      }
    });
  }

  // ── Compose ──
  function doCompose(prompt) {
    if (!settings.enableAI) { showToast('AI features disabled'); return; }
    const panel = ensurePanel();
    const resultEl = panel.querySelector('#lpComposeResult');
    const actionsEl = panel.querySelector('#lpComposeActions');
    resultEl.innerHTML = '<div class="lp-spinner"></div>';
    resultEl.style.display = 'block';
    actionsEl.style.display = 'none';
    const ctx = activeTarget ? getTargetText(activeTarget).slice(0, 300) : '';
    chrome.runtime.sendMessage({ type: 'LINGUAAI_REWRITE', text: prompt, action: 'compose', instruction: prompt, context: ctx }, (resp) => {
      if (resp && resp.ok && resp.data) {
        const result = resp.data.result || resp.data.correctedText || 'No result generated';
        resultEl.textContent = result;
        resultEl.style.display = 'block';
        actionsEl.style.display = 'flex';
      } else {
        resultEl.innerHTML = `<div style="color:#EF4444;">Compose failed: ${escapeHtml(resp ? resp.error : 'Network error')}</div>`;
      }
    });
  }

  // ── Double-click: synonyms ──
  function showSynonyms(word, rect) {
    if (!settings.enableSynonyms) return;
    const card = ensureCard();
    card.innerHTML = `
      <div class="lc-header">
        <span>Vocabulary: ${escapeHtml(word)}</span>
        <span class="lc-close" title="close">\u00d7</span>
      </div>
      <div class="lc-body">
        <div class="lc-spinner"></div>
        <div style="text-align:center;color:#6B7280;font-size:12px;">Finding synonyms\u2026</div>
      </div>`;
    if (activeTarget) positionCard(activeTarget.getBoundingClientRect());
    else { card.style.top = `${rect.top}px`; card.style.left = `${rect.left}px`; }
    card.style.display = 'block';
    card.querySelector('.lc-close').addEventListener('click', hideCard);
    chrome.runtime.sendMessage({ type: 'LINGUAAI_SYNONYMS', word }, (resp) => {
      if (resp && resp.ok && resp.data) {
        const synonyms = resp.data.synonyms || resp.data.alternatives || [];
        const definition = resp.data.definition || '';
        let html = '';
        if (definition) {
          html += `<div style="padding:6px 10px;color:#64748B;font-size:12px;margin-bottom:4px;"><strong>Definition:</strong> ${escapeHtml(definition)}</div>`;
        }
        if (synonyms.length > 0) {
          html += '<div style="padding:6px 10px;display:flex;flex-wrap:wrap;gap:4px;">';
          for (const syn of synonyms) {
            html += `<button class="lc-btn lc-dict" data-syn="${escapeHtml(syn)}" style="font-size:11px;">${escapeHtml(syn)}</button>`;
          }
          html += '</div>';
        } else {
          html += '<div class="lc-empty">No synonyms found.</div>';
        }
        card.querySelector('.lc-body').innerHTML = html;
        card.querySelectorAll('[data-syn]').forEach(btn => {
          btn.addEventListener('click', () => {
            const syn = btn.dataset.syn;
            if (activeTarget) {
              const current = getTargetText(activeTarget);
              const newText = current.replace(new RegExp(`\\b${escapeHtml(word)}\\b`, 'i'), syn);
              setTargetText(activeTarget, newText);
              showToast(`Replaced "${word}" with "${syn}"`);
              hideCard();
            }
          });
        });
      } else {
        card.querySelector('.lc-body').innerHTML = '<div class="lc-empty">Could not find synonyms.</div>';
      }
    });
  }

  // ── MutationObserver for dynamic fields ──
  let mutationObserver = null;
  function startObserver() {
    if (mutationObserver) return;
    mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches && node.matches(VALID_INPUTS)) {
            // It will be picked up by focusin, no action needed
          }
          if (node.id && node.id.startsWith('linguaai')) continue;
        }
      }
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ── Debounced auto-analyze ──
  const debouncedAnalyze = debounce((target) => {
    if (!isEnabled || perSiteDisabled) return;
    if (!settings.autoCheck) return;
    const text = getTargetText(target);
    if (text && text.length >= 3) analyzeAndShowCard(target, false);
  }, 1200);

  // ── Event listeners ──
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!t || !t.matches || !t.matches(VALID_INPUTS)) return;
    const fieldType = classifyField(t);
    if (fieldType === 'skip') return;
    if (!isEnabled || perSiteDisabled) return;
    activeTarget = t;
    const rect = t.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) showButton(rect);
  });

  document.addEventListener('focusout', (e) => {
    const t = e.target;
    if (!t || !t.matches || !t.matches(VALID_INPUTS)) return;
    setTimeout(() => {
      if (!document.activeElement || !document.activeElement.closest ||
          (!document.activeElement.closest('#linguaai-card') &&
           !document.activeElement.closest('#linguaai-panel') &&
           !document.activeElement.closest('#linguaai-selection-toolbar'))) {
        hideButton();
      }
    }, 200);
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!t || !t.matches || !t.matches(VALID_INPUTS)) return;
    if (!isEnabled || perSiteDisabled) return;
    const fieldType = classifyField(t);
    if (fieldType === 'skip') return;
    activeTarget = t;
    clearHighlights();
    debouncedAnalyze(t);
  });

  // Selection-based toolbar
  document.addEventListener('mouseup', (e) => {
    if (e.target.closest && e.target.closest('#linguaai-panel, #linguaai-card, #linguaai-fab, #linguaai-selection-toolbar, #linguaai-compose-panel')) return;
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) { hideSelectionToolbar(); return; }
      const text = sel.toString().trim();
      if (text.length < 3) { hideSelectionToolbar(); return; }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      showSelectionToolbar(rect);
    }, 10);
  });

  // Double-click for synonyms
  document.addEventListener('dblclick', (e) => {
    if (!settings.enableSynonyms) return;
    if (e.target.closest && e.target.closest('#linguaai-panel, #linguaai-card, #linguaai-fab, #linguaai-selection-toolbar, #linguaai-compose-panel')) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const word = sel.toString().trim();
    if (word.length < 2 || word.length > 50) return;
    if (!/^[a-zA-Z]+$/.test(word)) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    showSynonyms(word, rect);
  });

  // Reposition on scroll/resize
  window.addEventListener('scroll', () => {
    if (activeTarget) {
      const rect = activeTarget.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) positionButton(rect);
      if (suggestionCard && suggestionCard.style.display !== 'none') positionCard(rect);
    }
    hideSelectionToolbar();
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (activeTarget) {
      const rect = activeTarget.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) positionButton(rect);
    }
  });

  // ── Messaging ──
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return false;
    if (msg.type === 'LINGUAAI_CHECK_SELECTION') {
      const sel = window.getSelection ? window.getSelection() : null;
      const text = sel ? sel.toString().trim() : '';
      sendResponse({ ok: true, text });
      return true;
    }
    if (msg.type === 'LINGUAAI_SELECTION_RESULT') {
      if (activeTarget && msg.data) renderCardContent(activeTarget, msg.data);
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'LINGUAAI_SETTINGS_UPDATED') {
      loadSettings().then(() => {
        if (!isEnabled || perSiteDisabled) {
          hideButton();
          hideCard();
          hidePanel();
          hideSelectionToolbar();
          clearHighlights();
        }
        sendResponse({ ok: true });
      });
      return true;
    }
    if (msg.type === 'LINGUAAI_UNDO') {
      undoLastChange();
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });

  // ── Init ──
  loadSettings().then(() => {
    ensureStyles();
    ensureButton();
    ensureCard();
    ensurePanel();
    ensureSelectionToolbar();
    startObserver();
  });
})();