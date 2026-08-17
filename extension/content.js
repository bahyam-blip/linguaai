// LinguaAI content script — floating FAB + suggestion card on editable fields
(function () {
  if (window.__linguaaiInjected) return;
  window.__linguaaiInjected = true;

  // --- State ---
  let floatingButton = null;
  let suggestionCard = null;
  let debounceTimer = null;
  let lastAnalyzedText = "";
  let activeTarget = null;
  let activeIssues = [];
  let currentHighlights = [];
  let isEnabled = true;

  // --- Selectors ---
  const VALID_INPUTS = 'textarea, input[type="text"], [contenteditable="true"], [contenteditable=""]';

  // --- Utility: debounce ---
  function debounce(fn, wait) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // --- Utility: escapeHtml (uses \u0026 to avoid raw & in entities) ---
  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "\u0026amp;")
      .replace(/</g, "\u0026lt;")
      .replace(/>/g, "\u0026gt;")
      .replace(/"/g, "\u0026quot;")
      .replace(/'/g, "\u0026#039;");
  }

  // --- Utility: get target text ---
  function getTargetText(target) {
    if (!target) return "";
    if (target.isContentEditable) {
      return (target.innerText || target.textContent || "").trim();
    }
    return (target.value || "").trim();
  }

  // --- Utility: set target text ---
  function setTargetText(target, text) {
    if (!target) return;
    if (target.isContentEditable) {
      target.innerText = text;
      target.dispatchEvent(new InputEvent("input", { bubbles: true }));
    } else {
      const start = target.selectionStart;
      const end = target.selectionEnd;
      target.value = text;
      try {
        target.setSelectionRange(start, end);
      } catch (_) {
        /* some inputs don't support setSelectionRange */
      }
      target.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
  }

  // --- Floating button ---
  function ensureButton() {
    if (floatingButton && document.body.contains(floatingButton)) return floatingButton;
    floatingButton = document.createElement("div");
    floatingButton.id = "linguaai-fab";
    floatingButton.title = "LinguaAI — check grammar";
    floatingButton.innerHTML = `
      <div class="linguaai-fab-inner">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
        </svg>
      </div>`;
    const styleId = "linguaai-fab-style";
    if (!document.getElementById(styleId)) {
      const st = document.createElement("style");
      st.id = styleId;
      st.textContent = `
        #linguaai-fab {
          position: fixed;
          z-index: 2147483646;
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          box-shadow: 0 4px 14px rgba(99,102,241,0.45);
          cursor: pointer;
          display: none;
          align-items: center;
          justify-content: center;
          transition: transform 0.15s ease;
        }
        #linguaai-fab:hover { transform: scale(1.08); }
        #linguaai-fab .linguaai-fab-inner { display: flex; align-items: center; justify-content: center; }
        #linguaai-fab.linguaai-loading .linguaai-fab-inner { opacity: 0.6; }
        #linguaai-card {
          position: fixed;
          z-index: 2147483647;
          width: 320px;
          max-height: 420px;
          overflow-y: auto;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          box-shadow: 0 12px 32px rgba(0,0,0,0.18);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px;
          color: #111827;
          display: none;
        }
        #linguaai-card .lc-header {
          padding: 10px 12px;
          border-bottom: 1px solid #f3f4f6;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        #linguaai-card .lc-body { padding: 6px 8px; }
        #linguaai-card .lc-empty { padding: 16px 12px; text-align: center; color: #6b7280; }
        #linguaai-card .lc-issue {
          padding: 8px 10px;
          border-radius: 8px;
          margin: 4px 0;
          background: #f9fafb;
          border: 1px solid #eef0f2;
        }
        #linguaai-card .lc-issue .lc-badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 600;
          padding: 1px 6px;
          border-radius: 6px;
          margin-bottom: 4px;
        }
        #linguaai-card .lc-issue .lc-badge.lc-error { background: #fee2e2; color: #b91c1c; }
        #linguaai-card .lc-issue .lc-badge.lc-warn { background: #fef3c7; color: #92400e; }
        #linguaai-card .lc-issue .lc-badge.lc-suggestion { background: #e0e7ff; color: #3730a3; }
        #linguaai-card .lc-issue .lc-fix { margin: 4px 0; line-height: 1.4; }
        #linguaai-card .lc-issue .lc-orig { color: #ef4444; text-decoration: line-through; }
        #linguaai-card .lc-issue .lc-arrow { color: #9ca3af; margin: 0 4px; }
        #linguaai-card .lc-issue .lc-new { color: #16a34a; font-weight: 500; }
        #linguaai-card .lc-issue .lc-explain { color: #6b7280; font-size: 12px; margin-top: 4px; }
        #linguaai-card .lc-issue .lc-accept {
          margin-top: 6px;
          background: #4f46e5;
          color: #fff;
          border: none;
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 12px;
          cursor: pointer;
        }
        #linguaai-card .lc-issue .lc-accept:hover { background: #4338ca; }
        #linguaai-card .lc-issue.lc-applied { opacity: 0.45; }
        #linguaai-card .lc-close {
          cursor: pointer;
          color: #9ca3af;
          font-size: 16px;
          line-height: 1;
          padding: 0 4px;
        }
        #linguaai-card .lc-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid #e5e7eb;
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: linguaai-spin 0.8s linear infinite;
          margin: 14px auto;
        }
        @keyframes linguaai-spin { to { transform: rotate(360deg); } }
      `;
      document.head.appendChild(st);
    }
    document.body.appendChild(floatingButton);
    floatingButton.addEventListener("click", () => {
      if (activeTarget) analyzeAndShowCard(activeTarget, true);
    });
    return floatingButton;
  }

  function positionButton(rect) {
    const btn = ensureButton();
    const margin = 6;
    btn.style.top = `${Math.max(rect.top - 44, 4)}px`;
    btn.style.left = `${rect.right - 44 - margin}px`;
  }

  function showButton(rect) {
    const btn = ensureButton();
    positionButton(rect);
    btn.style.display = "flex";
  }

  function hideButton() {
    if (floatingButton) floatingButton.style.display = "none";
  }

  // --- Suggestion card ---
  function ensureCard() {
    if (suggestionCard && document.body.contains(suggestionCard)) return suggestionCard;
    suggestionCard = document.createElement("div");
    suggestionCard.id = "linguaai-card";
    ensureButton(); // ensure styles exist
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
    if (top + cardMaxH > vh - 8) {
      // flip above if it would overflow the bottom
      const aboveTop = rect.top - cardMaxH - 6;
      if (aboveTop > 8) top = aboveTop;
    }
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  }

  function hideCard() {
    if (suggestionCard) suggestionCard.style.display = "none";
  }

  // --- Inline highlights ---
  function clearHighlights() {
    for (const h of currentHighlights) {
      if (h && h.unwrap) {
        try { h.unwrap(); } catch (_) { /* noop */ }
      }
    }
    currentHighlights = [];
  }

  // Highlights for contenteditable only (safe, DOM-based)
  function applyHighlights(target, issues) {
    clearHighlights();
    if (!target || !target.isContentEditable || !issues || issues.length === 0) return;
    // Highlighting inside editable fields is risky for caret position; keep it lightweight.
    // Wrapped in try/catch so a failure never blocks the card.
    try {
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => (node.nodeValue && node.nodeValue.length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
      });
      const textNodes = [];
      let n;
      while ((n = walker.nextNode())) textNodes.push(n);
      for (const issue of issues) {
        if (!issue || !issue.original) continue;
        for (const node of textNodes) {
          const idx = node.nodeValue.indexOf(issue.original);
          if (idx >= 0) {
            const range = document.createRange();
            range.setStart(node, idx);
            range.setEnd(node, idx + issue.original.length);
            const span = document.createElement("span");
            span.className = "linguaai-mark";
            span.style.cssText = "border-bottom: 2px wavy #f59e0b; background: rgba(245,158,11,0.08); cursor: pointer;";
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
              span.addEventListener("mouseenter", () => showSingleSuggestion(issue));
            } catch (_) {
              // surroundContents fails on ranges crossing element boundaries; skip gracefully.
            }
            break;
          }
        }
      }
    } catch (_) {
      clearHighlights();
    }
  }

  function showSingleSuggestion(issue) {
    const card = ensureCard();
    const severityClass = issue.severity === "error" ? "lc-error" : issue.severity === "warn" ? "lc-warn" : "lc-suggestion";
    card.innerHTML = `
      <div class="lc-header">
        <span>LinguaAI</span>
        <span class="lc-close" title="close">\u0026times;</span>
      </div>
      <div class="lc-body">
        <div class="lc-issue">
          <span class="lc-badge ${severityClass}">${escapeHtml(issue.type || "issue")}</span>
          <div class="lc-fix">
            <span class="lc-orig">${escapeHtml(issue.original)}</span>
            <span class="lc-arrow">\u0026rarr;</span>
            <span class="lc-new">${escapeHtml(issue.suggestion)}</span>
          </div>
          ${issue.explanation ? `<div class="lc-explain">${escapeHtml(issue.explanation)}</div>` : ""}
        </div>
      </div>`;
    card.style.display = "block";
    const closeBtn = card.querySelector(".lc-close");
    if (closeBtn) closeBtn.addEventListener("click", hideCard);
  }

  // --- Analyze ---
  function analyzeAndShowCard(target, force) {
    const text = getTargetText(target);
    if (!text) return;
    if (!force && text === lastAnalyzedText) return;
    lastAnalyzedText = text;

    const card = ensureCard();
    const rect = target.getBoundingClientRect();
    positionCard(rect);
    card.innerHTML = `
      <div class="lc-header">
        <span>LinguaAI</span>
        <span class="lc-close" title="close">\u0026times;</span>
      </div>
      <div class="lc-body">
        <div class="lc-spinner"></div>
        <div class="lc-empty">Analyzing your text\u0026hellip;</div>
      </div>`;
    card.style.display = "block";
    const closeBtn = card.querySelector(".lc-close");
    if (closeBtn) closeBtn.addEventListener("click", hideCard);

    const btn = floatingButton;
    if (btn) btn.classList.add("linguaai-loading");

    chrome.runtime.sendMessage({ type: "LINGUAAI_ANALYZE", text, mode: "full" }, (resp) => {
      if (btn) btn.classList.remove("linguaai-loading");
      if (!resp || !resp.ok) {
        card.innerHTML = `
          <div class="lc-header">
            <span>LinguaAI</span>
            <span class="lc-close" title="close">\u0026times;</span>
          </div>
          <div class="lc-body">
            <div class="lc-empty">${escapeHtml((resp && resp.error) || "Analysis failed")}</div>
          </div>`;
        const cb = card.querySelector(".lc-close");
        if (cb) cb.addEventListener("click", hideCard);
        return;
      }
      activeIssues = (resp.data && resp.data.issues) || [];
      renderCardContent(target, resp.data);
    });
  }

  function renderCardContent(target, data) {
    const card = ensureCard();
    const issues = (data.issues || []).filter((i) => i && i.original && i.suggestion);

    applyHighlights(target, issues);

    if (issues.length === 0) {
      card.innerHTML = `
        <div class="lc-header">
          <span>LinguaAI</span>
          <span class="lc-close" title="close">\u0026times;</span>
        </div>
        <div class="lc-body">
          <div class="lc-empty">\u0026check; All clear! No issues detected.</div>
        </div>`;
      const cb = card.querySelector(".lc-close");
      if (cb) cb.addEventListener("click", hideCard);
      return;
    }

    let bodyHtml = issues.map((issue, idx) => {
      const severityClass = issue.severity === "error" ? "lc-error" : issue.severity === "warn" ? "lc-warn" : "lc-suggestion";
      return `
        <div class="lc-issue" data-idx="${idx}">
          <span class="lc-badge ${severityClass}">${escapeHtml(issue.type || "issue")}</span>
          <div class="lc-fix">
            <span class="lc-orig">${escapeHtml(issue.original)}</span>
            <span class="lc-arrow">\u0026rarr;</span>
            <span class="lc-new">${escapeHtml(issue.suggestion)}</span>
          </div>
          ${issue.explanation ? `<div class="lc-explain">${escapeHtml(issue.explanation)}</div>` : ""}
          <button class="lc-accept" data-idx="${idx}">Apply fix</button>
        </div>`;
    }).join("");

    card.innerHTML = `
      <div class="lc-header">
        <span>LinguaAI \u0026middot; ${issues.length} issue${issues.length === 1 ? "" : "s"}</span>
        <span class="lc-close" title="close">\u0026times;</span>
      </div>
      <div class="lc-body">${bodyHtml}</div>`;

    card.style.display = "block";

    const closeBtn = card.querySelector(".lc-close");
    if (closeBtn) closeBtn.addEventListener("click", hideCard);

    card.querySelectorAll(".lc-accept").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        const issue = issues[idx];
        if (!issue) return;
        const current = getTargetText(target);
        const pos = current.indexOf(issue.original);
        if (pos >= 0) {
          const newText = current.slice(0, pos) + issue.suggestion + current.slice(pos + issue.original.length);
          setTargetText(target, newText);
          btn.closest(".lc-issue").classList.add("lc-applied");
          btn.disabled = true;
          btn.textContent = "Applied";
          lastAnalyzedText = getTargetText(target);
        }
      });
    });
  }

  // --- Debounced auto-analyze while typing ---
  const debouncedAnalyze = debounce((target) => {
    if (!isEnabled) return;
    const text = getTargetText(target);
    if (text && text.length >= 3) analyzeAndShowCard(target, false);
  }, 900);

  // --- Event listeners ---
  document.addEventListener("focusin", (e) => {
    const t = e.target;
    if (!t || !t.matches || !t.matches(VALID_INPUTS)) {
      return;
    }
    activeTarget = t;
    const rect = t.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) showButton(rect);
  });

  document.addEventListener("focusout", (e) => {
    // delay so clicking the FAB/card still registers before we hide
    const t = e.target;
    if (!t || !t.matches || !t.matches(VALID_INPUTS)) return;
    setTimeout(() => {
      if (!document.activeElement || !document.activeElement.closest || !document.activeElement.closest("#linguaai-card")) {
        hideButton();
      }
    }, 180);
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (!t || !t.matches || !t.matches(VALID_INPUTS)) return;
    activeTarget = t;
    clearHighlights();
    debouncedAnalyze(t);
  });

  window.addEventListener("scroll", () => {
    if (activeTarget) {
      const rect = activeTarget.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) positionButton(rect);
      if (suggestionCard && suggestionCard.style.display !== "none") positionCard(rect);
    }
  }, { passive: true });

  window.addEventListener("resize", () => {
    if (activeTarget) {
      const rect = activeTarget.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) positionButton(rect);
      if (suggestionCard && suggestionCard.style.display !== "none") positionCard(rect);
    }
  });

  // --- Messaging ---
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return false;
    if (msg.type === "LINGUAAI_CHECK_SELECTION") {
      const sel = window.getSelection ? window.getSelection() : null;
      const text = sel ? sel.toString().trim() : "";
      sendResponse({ ok: true, text });
      return true;
    }
    if (msg.type === "LINGUAAI_SELECTION_RESULT") {
      if (activeTarget && msg.data) {
        renderCardContent(activeTarget, msg.data);
      }
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });

  ensureButton();
})();
