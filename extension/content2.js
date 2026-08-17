  // ── Floating button ──
  function ensureButton() {
    if (floatingButton && document.body.contains(floatingButton)) return floatingButton;
    floatingButton = document.createElement('div');
    floatingButton.id = 'linguaai-fab';
    floatingButton.title = 'LinguaAI Assistant';
    floatingButton.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
        <path d="m9 7.6 2 2 4-4"></path>
      </svg>`;
    document.body.appendChild(floatingButton);
    floatingButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (assistantPanel && assistantPanel.style.display === 'flex') {
        hidePanel();
      } else {
        showPanel();
      }
    });
    return floatingButton;
  }

  function showFabBadge(count) {
    const btn = ensureButton();
    let badge = btn.querySelector('.fab-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'fab-badge';
        btn.appendChild(badge);
      }
      badge.textContent = count;
    } else if (badge) {
      badge.remove();
    }
  }

  function positionButton(rect) {
    const btn = ensureButton();
    btn.style.top = `${Math.max(rect.top - 42, 4)}px`;
    btn.style.left = `${rect.right - 42 - 6}px`;
  }

  function showButton(rect) {
    if (!settings.enableFloatingAssistant) return;
    const btn = ensureButton();
    positionButton(rect);
    btn.style.display = 'flex';
  }

  function hideButton() {
    if (floatingButton) floatingButton.style.display = 'none';
  }

  // ── Assistant panel ──
  function ensurePanel() {
    if (assistantPanel && document.body.contains(assistantPanel)) return assistantPanel;
    assistantPanel = document.createElement('div');
    assistantPanel.id = 'linguaai-panel';
    assistantPanel.innerHTML = `
      <div class="lp-header">
        <span class="lp-title">LinguaAI</span>
        <span class="lp-close" title="Close">\u00d7</span>
      </div>
      <div class="lp-tabs">
        <div class="lp-tab active" data-tab="suggestions">Suggestions</div>
        <div class="lp-tab" data-tab="rewrite">Rewrite</div>
        <div class="lp-tab" data-tab="compose">Compose</div>
        <div class="lp-tab" data-tab="chat">Chat</div>
      </div>
      <div class="lp-body">
        <div class="lp-section active" data-section="suggestions">
          <div class="lp-score-row">
            <div class="lp-score-ring" id="lpScoreRing">--</div>
            <div class="lp-score-info">
              <div class="lp-score-label" id="lpScoreLabel">Writing Score</div>
              <div class="lp-score-sub" id="lpScoreSub">Start typing to analyze</div>
            </div>
          </div>
          <div id="lpIssues"><div class="lp-empty">Click the check button to analyze your text.</div></div>
          <button class="lp-action-btn" id="lpAnalyzeBtn">Check Grammar</button>
          <button class="lp-action-btn secondary" id="lpUndoBtn">Undo Last Change</button>
        </div>

        <div class="lp-section" data-section="rewrite">
          <div class="lp-rewrite-area">
            <div style="font-weight:600;margin-bottom:8px;">Rewrite Selected Text</div>
            <textarea class="lp-rewrite-input" id="lpRewriteInput" placeholder="Select text in the page, or type text here to rewrite..."></textarea>
            <div style="font-weight:600;margin:10px 0 6px;font-size:12px;color:#64748B;">Choose a tone:</div>
            <div class="lp-tone-grid">
              ${['Improve','Shorten','Expand','Simplify','Professional','Friendly','Formal','Casual','Confident','Concise','Persuasive','Creative'].map(t =>
                `<div class="lp-tone-btn" data-tone="${t.toLowerCase()}">${t}</div>`
              ).join('')}
            </div>
            <div id="lpRewriteResult" style="display:none;margin-top:10px;"></div>
          </div>
        </div>

        <div class="lp-section" data-section="compose">
          <div class="lp-compose-area">
            <div style="font-weight:600;margin-bottom:8px;">AI Compose</div>
            <textarea class="lp-compose-input" id="lpComposeInput" placeholder="Describe what you want to write...&#10;e.g. 'Write a professional email asking to reschedule the meeting'"></textarea>
            <button class="lp-action-btn" id="lpComposeBtn" style="margin-top:8px;">Generate</button>
            <div class="lp-compose-result" id="lpComposeResult"></div>
            <div class="lp-actions" id="lpComposeActions" style="display:none;">
              <button class="lp-btn lp-btn-accept" id="lpComposeInsert">Insert</button>
              <button class="lp-btn lp-btn-secondary" id="lpComposeRegenerate">Regenerate</button>
              <button class="lp-btn lp-btn-ignore" id="lpComposeCopy">Copy</button>
            </div>
          </div>
        </div>

        <div class="lp-section" data-section="chat">
          <div class="lp-chat-area">
            <div class="lp-chat-log" id="lpChatLog">
              <div class="lp-chat-msg ai">Hi! I'm your AI writing assistant. Ask me to rewrite, explain grammar, or generate text.</div>
            </div>
            <div class="lp-chat-input-row">
              <input class="lp-chat-input" id="lpChatInput" placeholder="Ask AI..." />
              <button class="lp-chat-send" id="lpChatSend">Send</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(assistantPanel);

    assistantPanel.querySelectorAll('.lp-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        assistantPanel.querySelectorAll('.lp-tab').forEach(t => t.classList.remove('active'));
        assistantPanel.querySelectorAll('.lp-section').forEach(s => s.classList.remove('active'));
        tab.classList.add('active');
        assistantPanel.querySelector(`.lp-section[data-section="${tab.dataset.tab}"]`).classList.add('active');
      });
    });

    assistantPanel.querySelector('.lp-close').addEventListener('click', hidePanel);
    assistantPanel.querySelector('#lpAnalyzeBtn').addEventListener('click', () => {
      if (activeTarget) analyzeAndShowCard(activeTarget, true);
    });
    assistantPanel.querySelector('#lpUndoBtn').addEventListener('click', undoLastChange);

    assistantPanel.querySelectorAll('.lp-tone-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tone = btn.dataset.tone;
        const text = (assistantPanel.querySelector('#lpRewriteInput').value || '').trim() ||
                     (activeTarget ? getTargetText(activeTarget) : '') ||
                     (window.getSelection ? window.getSelection().toString().trim() : '');
        if (!text) { showToast('Select or type text to rewrite'); return; }
        doRewrite(text, tone);
      });
    });

    assistantPanel.querySelector('#lpComposeBtn').addEventListener('click', () => {
      const prompt = assistantPanel.querySelector('#lpComposeInput').value.trim();
      if (!prompt) { showToast('Enter a prompt'); return; }
      doCompose(prompt);
    });
    assistantPanel.querySelector('#lpComposeInsert').addEventListener('click', () => {
      const result = assistantPanel.querySelector('#lpComposeResult').textContent;
      if (activeTarget && result) { setTargetText(activeTarget, result); showToast('Inserted into editor'); }
    });
    assistantPanel.querySelector('#lpComposeRegenerate').addEventListener('click', () => {
      const prompt = assistantPanel.querySelector('#lpComposeInput').value.trim();
      if (prompt) doCompose(prompt);
    });
    assistantPanel.querySelector('#lpComposeCopy').addEventListener('click', () => {
      const result = assistantPanel.querySelector('#lpComposeResult').textContent;
      if (result) { navigator.clipboard.writeText(result).then(() => showToast('Copied')); }
    });

    const chatInput = assistantPanel.querySelector('#lpChatInput');
    const chatSend = assistantPanel.querySelector('#lpChatSend');
    const chatLog = assistantPanel.querySelector('#lpChatLog');

    function sendChat() {
      const msg = chatInput.value.trim();
      if (!msg) return;
      chatInput.value = '';
      chatLog.insertAdjacentHTML('beforeend', `<div class="lp-chat-msg user">${escapeHtml(msg)}</div>`);
      chatLog.scrollTop = chatLog.scrollHeight;

      const ctx = activeTarget ? getTargetText(activeTarget).slice(0, 500) : '';
      const sel = window.getSelection ? window.getSelection().toString().trim() : '';

      const spinnerId = 'chat-spinner-' + Date.now();
      chatLog.insertAdjacentHTML('beforeend', `<div id="${spinnerId}" class="lp-chat-msg ai"><div class="lp-spinner"></div></div>`);
      chatLog.scrollTop = chatLog.scrollHeight;

      chrome.runtime.sendMessage({ type: 'LINGUAAI_CHAT', message: msg, context: ctx, selection: sel }, (resp) => {
        const sp = document.getElementById(spinnerId);
        if (sp) sp.remove();
        if (resp && resp.ok && resp.data) {
          const reply = resp.data.result || resp.data.reply || 'No response';
          chatLog.insertAdjacentHTML('beforeend', `<div class="lp-chat-msg ai">${escapeHtml(reply)}</div>`);
        } else {
          chatLog.insertAdjacentHTML('beforeend', `<div class="lp-chat-msg ai">Sorry, I couldn't process that. ${escapeHtml(resp ? resp.error : 'Network error')}</div>`);
        }
        chatLog.scrollTop = chatLog.scrollHeight;
      });
    }
    chatSend.addEventListener('click', sendChat);
    chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } });

    return assistantPanel;
  }

  function showPanel() {
    const panel = ensurePanel();
    const btn = ensureButton();
    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    let left = rect.right - 340;
    if (left < 8) left = 8;
    if (left + 340 > vw - 8) left = vw - 348;
    let top = rect.bottom + 6;
    if (top + 480 > window.innerHeight - 8) { top = Math.max(8, rect.top - 480 - 6); }
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
    panel.style.display = 'flex';

    const sel = window.getSelection ? window.getSelection().toString().trim() : '';
    if (sel) { panel.querySelector('#lpRewriteInput').value = sel; }
    else if (activeTarget) {
      const text = getTargetText(activeTarget);
      if (text) panel.querySelector('#lpRewriteInput').value = text.slice(0, 500);
    }
  }

  function hidePanel() { if (assistantPanel) assistantPanel.style.display = 'none'; }

  // ── Selection toolbar ──
  function ensureSelectionToolbar() {
    if (selectionToolbar && document.body.contains(selectionToolbar)) return selectionToolbar;
    selectionToolbar = document.createElement('div');
    selectionToolbar.id = 'linguaai-selection-toolbar';
    selectionToolbar.innerHTML = `
      <button class="lst-btn" data-action="rewrite">Rewrite</button>
      <button class="lst-btn" data-action="improve">Improve</button>
      <button class="lst-btn" data-action="shorten">Shorten</button>
      <button class="lst-btn" data-action="expand">Expand</button>
      <div class="lst-sep"></div>
      <button class="lst-btn" data-action="simplify">Simplify</button>
      <button class="lst-btn" data-action="professional">Professional</button>
      <button class="lst-btn" data-action="friendly">Friendly</button>
      <div class="lst-sep"></div>
      <button class="lst-btn" data-action="summarize">Summarize</button>
      <button class="lst-btn" data-action="compose">AI</button>
    `;
    document.body.appendChild(selectionToolbar);

    selectionToolbar.querySelectorAll('.lst-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const action = btn.dataset.action;
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : '';
        if (!text) { hideSelectionToolbar(); return; }

        if (action === 'compose') {
          showPanel();
          assistantPanel.querySelector('.lp-tab[data-tab="compose"]').click();
          assistantPanel.querySelector('#lpComposeInput').value = `Based on this text: "${text.slice(0, 200)}", write a response:`;
        } else if (action === 'rewrite') {
          showPanel();
          assistantPanel.querySelector('.lp-tab[data-tab="rewrite"]').click();
          assistantPanel.querySelector('#lpRewriteInput').value = text;
        } else {
          doRewrite(text, action);
        }
        hideSelectionToolbar();
      });
    });

    return selectionToolbar;
  }

  function showSelectionToolbar(rect) {
    const tb = ensureSelectionToolbar();
    tb.style.top = `${rect.top - 40}px`;
    tb.style.left = `${rect.left}px`;
    tb.style.display = 'flex';
    const tbRect = tb.getBoundingClientRect();
    if (tbRect.left < 8) tb.style.left = '8px';
    if (tbRect.right > window.innerWidth - 8) { tb.style.left = `${window.innerWidth - tbRect.width - 8}px`; }
    if (tbRect.top < 8) { tb.style.top = `${rect.bottom + 6}px`; }
  }

  function hideSelectionToolbar() { if (selectionToolbar) selectionToolbar.style.display = 'none'; }

  // ── Inline highlights ──
  function clearHighlights() {
    for (const h of currentHighlights) { if (h && h.unwrap) { try { h.unwrap(); } catch (_) {} } }
    currentHighlights = [];
  }

  function applyHighlights(target, issues) {
    clearHighlights();
    if (!target || !target.isContentEditable || !issues || issues.length === 0) return;
    try {
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => (node.nodeValue && node.nodeValue.length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
      });
      const textNodes = [];
      let n;
      while ((n = walker.nextNode())) textNodes.push(n);

      for (const issue of issues) {
        if (!issue || !issue.original) continue;
        const ignoreKey = `${issue.original}::${issue.suggestion}`;
        if (ignoredSuggestions.has(ignoreKey)) continue;
        if (issue.type && issue.type.toLowerCase().includes('spelling') && customDictionary.includes(issue.original)) continue;

        for (const node of textNodes) {
          const idx = node.nodeValue.indexOf(issue.original);
          if (idx >= 0) {
            const range = document.createRange();
            range.setStart(node, idx);
            range.setEnd(node, idx + issue.original.length);
            const span = document.createElement('span');
            span.className = 'linguaai-mark';
            const catStyle = getCategoryStyle(issue.type);
            span.style.cssText = `border-bottom-color: ${catStyle.color}; background: ${catStyle.bg};`;
            span.dataset.issueIdx = activeIssues.indexOf(issue);
            try {
              range.surroundContents(span);
              currentHighlights.push({
                unwrap: () => {
                  const parent = span.parentNode;
                  if (!parent) return;
                  while (span.firstChild) parent.insertBefore(span.firstChild, span);
                  parent.removeChild(span);
                  parent.normalize();
                },
              });
              span.addEventListener('mouseenter', () => showSingleSuggestion(issue));
              break;
            } catch (_) {}
          }
        }
      }
    } catch (_) { clearHighlights(); }
  }

  // ── Suggestion card ──
  function ensureCard() {
    if (suggestionCard && document.body.contains(suggestionCard)) return suggestionCard;
    suggestionCard = document.createElement('div');
    suggestionCard.id = 'linguaai-card';
    document.body.appendChild(suggestionCard);
    return suggestionCard;
  }

  function positionCard(rect) {
    const card = ensureCard();
    const cardWidth = 320;
    const cardMaxH = 420;
    let top = rect.bottom + 6;
    let left = rect.right - cardWidth;
    if (left < 8) left = 8;
    const vw = window.innerWidth;
    if (left + cardWidth > vw - 8) left = vw - cardWidth - 8;
    const vh = window.innerHeight;
    if (top + cardMaxH > vh - 8) { const aboveTop = rect.top - cardMaxH - 6; if (aboveTop > 8) top = aboveTop; }
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  }

  function hideCard() { if (suggestionCard) suggestionCard.style.display = 'none'; }

  function showSingleSuggestion(issue) {
    const card = ensureCard();
    const catStyle = getCategoryStyle(issue.type);
    card.innerHTML = `
      <div class="lc-header">
        <span>${escapeHtml(catStyle.label)}</span>
        <span class="lc-close" title="close">\u00d7</span>
      </div>
      <div class="lc-body">
        <div class="lc-issue">
          <span class="lc-badge" style="background:${catStyle.bg};color:${catStyle.color};">${escapeHtml(issue.type || 'suggestion')}</span>
          <div class="lc-fix">
            <span class="lc-orig">${escapeHtml(issue.original)}</span>
            \u2192
            <span class="lc-new">${escapeHtml(issue.suggestion)}</span>
          </div>
          ${issue.explanation ? `<div class="lc-explain">${escapeHtml(issue.explanation)}</div>` : ''}
          <div class="lc-actions">
            <button class="lc-btn lc-accept" data-action="accept">Replace</button>
            <button class="lc-btn lc-ignore" data-action="ignore">Ignore</button>
            <button class="lc-btn lc-dict" data-action="dict">Add to dictionary</button>
          </div>
        </div>
      </div>`;
    card.style.display = 'block';
    if (activeTarget) positionCard(activeTarget.getBoundingClientRect());

    card.querySelector('.lc-close').addEventListener('click', hideCard);
    card.querySelector('[data-action="accept"]').addEventListener('click', () => { applySuggestion(issue); hideCard(); });
    card.querySelector('[data-action="ignore"]').addEventListener('click', () => {
      const key = `${issue.original}::${issue.suggestion}`;
      ignoredSuggestions.add(key);
      chrome.storage.sync.set({ ignoredSuggestions: Array.from(ignoredSuggestions) });
      hideCard();
      showToast('Suggestion ignored');
    });
    card.querySelector('[data-action="dict"]').addEventListener('click', () => {
      if (!customDictionary.includes(issue.original)) {
        customDictionary.push(issue.original);
        chrome.storage.sync.set({ customDictionary });
        hideCard();
        showToast(`"${issue.original}" added to dictionary`);
      }
    });
  }