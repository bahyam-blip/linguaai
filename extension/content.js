// LinguaAI — content script (Grammarly-like inline grammar assistant)
// Vanilla JS, Manifest V3, self-contained (all CSS injected via JS).
// Injects into text inputs, textareas, and contenteditable elements.

(function () {
  if (window.__linguaaiInjected) return;
  window.__linguaaiInjected = true;

  let activeElement = null;
  let floatingBtn = null;
  let resultCard = null;
  let settings = { enabled: true, autoCheck: true };
  let debounceTimer = null;
  let lastAnalyzedText = "";

  // ---------- Settings ----------
  async function loadSettings() {
    const stored = await chrome.storage.sync.get({
      enabled: true,
      autoCheck: true,
    });
    settings = stored;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.enabled) settings.enabled = changes.enabled.newValue;
    if (changes.autoCheck) settings.autoCheck = changes.autoCheck.newValue;
    if (settings.enabled === false) {
      hideFloatingButton();
      hideResultCard();
    }
  });

  // ---------- Helpers ----------
  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, """)
      .replace(/'/g, "&#039;");
  }

  function isEditable(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") {
      const t = (el.type || "").toLowerCase();
      return ["text", "search", "url", "email"].includes(t);
    }
    if (el.isContentEditable) return true;
    return false;
  }

  function getElementText(el) {
    if (!el) return "";
    if (el.isContentEditable) {
      return el.innerText || el.textContent || "";
    }
    return el.value || "";
  }

  function setElementText(el, text) {
    if (!el) return;
    if (el.isContentEditable) {
      el.innerText = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function applySuggestion(el, original, suggestion) {
    if (el.isContentEditable) {
      const current = el.innerText || "";
      const idx = current.indexOf(original);
      if (idx >= 0) {
        const newText =
          current.slice(0, idx) + suggestion + current.slice(idx + original.length);
        el.innerText = newText;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }
    } else {
      const current = el.value || "";
      const idx = current.indexOf(original);
      if (idx >= 0) {
        el.value = current.slice(0, idx) + suggestion + current.slice(idx + original.length);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  // ---------- CSS injection ----------
  function injectStyles() {
    if (document.getElementById("linguaai-content-styles")) return;
    const style = document.createElement("style");
    style.id = "linguaai-content-styles";
    style.textContent = `
      .linguaai-fab {
        position: fixed;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: #10b981;
        border: 2px solid #fff;
        box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
        cursor: pointer;
        z-index: 2147483646;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.15s, background 0.15s;
        padding: 0;
        margin: 0;
      }
      .linguaai-fab:hover { transform: scale(1.12); background: #059669; }
      .linguaai-fab svg { width: 14px; height: 14px; display: block; }
      .linguaai-fab.loading { background: #9ca3af; cursor: wait; }
      .linguaai-fab.loading svg { animation: linguaai-spin 0.8s linear infinite; }
      @keyframes linguaai-spin { to { transform: rotate(360deg); } }

      .linguaai-card {
        position: fixed;
        width: 320px;
        max-height: 360px;
        overflow-y: auto;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        color: #1f2937;
        padding: 0;
      }
      .linguaai-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        border-bottom: 1px solid #e5e7eb;
        background: #f9fafb;
        border-radius: 12px 12px 0 0;
      }
      .linguaai-card-title {
        font-size: 13px;
        font-weight: 700;
        color: #10b981;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .linguaai-score {
        font-size: 11px;
        color: #6b7280;
      }
      .linguaai-score b { color: #10b981; font-size: 13px; }
      .linguaai-close {
        background: transparent;
        border: none;
        color: #9ca3af;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        padding: 2px 6px;
        border-radius: 4px;
      }
      .linguaai-close:hover { color: #1f2937; background: #f3f4f6; }
      .linguaai-card-body { padding: 8px 14px; }
      .linguaai-empty {
        text-align: center;
        padding: 20px 0;
        color: #10b981;
      }
      .linguaai-empty-icon { font-size: 28px; margin-bottom: 4px; }
      .linguaai-empty-title { font-size: 13px; font-weight: 600; }
      .linguaai-empty-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
      .linguaai-issue {
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 8px 10px;
        margin-bottom: 8px;
        background: #fafafa;
      }
      .linguaai-issue:last-child { margin-bottom: 0; }
      .linguaai-badge {
        display: inline-block;
        font-size: 9px;
        padding: 2px 6px;
        border-radius: 6px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        margin-bottom: 4px;
      }
      .linguaai-badge-critical { background: #fee2e2; color: #b91c1c; }
      .linguaai-badge-warning { background: #fef3c7; color: #92400e; }
      .linguaai-badge-suggestion { background: #d1fae5; color: #065f46; }
      .linguaai-fix {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        margin: 3px 0;
        flex-wrap: wrap;
      }
      .linguaai-orig { text-decoration: line-through; color: #9ca3af; }
      .linguaai-arrow { color: #9ca3af; }
      .linguaai-new { color: #10b981; font-weight: 600; }
      .linguaai-explain { font-size: 11px; color: #6b7280; margin-top: 3px; line-height: 1.4; }
      .linguaai-apply {
        background: #10b981;
        color: #fff;
        border: none;
        border-radius: 4px;
        padding: 3px 10px;
        font-size: 11px;
        cursor: pointer;
        margin-top: 5px;
      }
      .linguaai-apply:hover { background: #059669; }
      .linguaai-apply:disabled { opacity: 0.5; cursor: default; }
      .linguaai-acceptall {
        display: block;
        width: 100%;
        background: #10b981;
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 8px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        margin-top: 8px;
      }
      .linguaai-acceptall:hover { background: #059669; }
      .linguaai-error { color: #ef4444; font-size: 12px; padding: 8px 0; }
      .linguaai-loading { display: flex; align-items: center; gap: 8px; color: #6b7280; font-size: 12px; padding: 12px 0; }
      .linguaai-spinner {
        width: 14px; height: 14px;
        border: 2px solid #e5e7eb;
        border-top-color: #10b981;
        border-radius: 50%;
        animation: linguaai-spin 0.8s linear infinite;
      }
    `;
    document.head.appendChild(style);
  }

  // ---------- Floating button ----------
  const FAB_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' +
    '<path d="m9 7.6 2 2 4-4"/></svg>';

  function createFloatingButton() {
    if (floatingBtn) return floatingBtn;
    floatingBtn = document.createElement("button");
    floatingBtn.className = "linguaai-fab";
    floatingBtn.title = "Check grammar with LinguaAI";
    floatingBtn.innerHTML = FAB_SVG;
    floatingBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleAnalyze();
    });
    document.body.appendChild(floatingBtn);
    return floatingBtn;
  }

  function positionFloatingButton(el) {
    if (!floatingBtn || !el) return;
    const rect = el.getBoundingClientRect();
    floatingBtn.style.top = Math.max(4, rect.top + 4) + "px";
    floatingBtn.style.left = Math.max(4, rect.right - 36) + "px";
  }

  function showFloatingButton(el) {
    createFloatingButton();
    positionFloatingButton(el);
    floatingBtn.style.display = "flex";
  }

  function hideFloatingButton() {
    if (floatingBtn) floatingBtn.style.display = "none";
  }

  // ---------- Result card ----------
  function createResultCard() {
    if (resultCard) return resultCard;
    resultCard = document.createElement("div");
    resultCard.className = "linguaai-card";
    document.body.appendChild(resultCard);
    return resultCard;
  }

  function positionResultCard(el) {
    if (!resultCard || !el) return;
    const rect = el.getBoundingClientRect();
    const cardWidth = 320;
    const cardMaxHeight = 360;
    let left = rect.right + 8;
    let top = rect.top;

    if (left + cardWidth > window.innerWidth - 8) {
      left = rect.left - cardWidth - 8;
    }
    if (left < 8) left = Math.max(8, rect.right - cardWidth);
    if (top + cardMaxHeight > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - cardMaxHeight - 8);
    }
    if (top < 8) top = 8;

    resultCard.style.left = left + "px";
    resultCard.style.top = top + "px";
  }

  function showResultCard(el) {
    createResultCard();
    positionResultCard(el);
    resultCard.style.display = "block";
  }

  function hideResultCard() {
    if (resultCard) resultCard.style.display = "none";
  }

  function renderCardLoading() {
    if (!resultCard) return;
    resultCard.innerHTML =
      '<div class="linguaai-card-header"><span class="linguaai-card-title">LinguaAI</span></div>' +
      '<div class="linguaai-card-body"><div class="linguaai-loading"><div class="linguaai-spinner"></div>Analyzing your text…</div></div>';
  }

  function renderCardError(message) {
    if (!resultCard) return;
    resultCard.innerHTML =
      '<div class="linguaai-card-header"><span class="linguaai-card-title">LinguaAI</span>' +
      '<button class="linguaai-close" title="Close">&times;</button></div>' +
      '<div class="linguaai-card-body"><div class="linguaai-error">' +
      escapeHtml(message || "Analysis failed.") +
      '</div><div style="font-size:11px;color:#6b7280;">Make sure your Sarvam AI API key is set in Options.</div></div>';
    bindCloseButton();
  }

  function renderCardResults(originalText, data) {
    if (!resultCard) return;
    const issues = (data.issues || []).filter((i) => i && i.original && i.suggestion);
    let headerRight = "";
    if (typeof data.overallScore === "number") {
      headerRight = '<span class="linguaai-score">Score: <b>' + data.overallScore + '</b>/100</span>';
    } else {
      headerRight = '<button class="linguaai-close" title="Close">&times;</button>';
    }

    let body = "";
    if (issues.length === 0) {
      body =
        '<div class="linguaai-empty"><div class="linguaai-empty-icon">✓</div>' +
        '<div class="linguaai-empty-title">All clear!</div>' +
        '<div class="linguaai-empty-sub">No issues detected in your text.</div></div>';
      if (data.correctedText && data.correctedText !== originalText) {
        body += '<button class="linguaai-acceptall" id="linguaai-use-corrected">Use corrected version</button>';
      }
    } else {
      body += issues
        .map((i, idx) => {
          const sev = i.severity || "suggestion";
          return (
            '<div class="linguaai-issue" data-idx="' + idx + '">' +
            '<span class="linguaai-badge linguaai-badge-' + sev + '">' +
            escapeHtml(i.type || "issue") + "</span>" +
            '<div class="linguaai-fix"><span class="linguaai-orig">' +
            escapeHtml(i.original) + '</span><span class="linguaai-arrow">→</span><span class="linguaai-new">' +
            escapeHtml(i.suggestion) + "</span></div>" +
            (i.explanation ? '<div class="linguaai-explain">' + escapeHtml(i.explanation) + "</div>" : "") +
            '<button class="linguaai-apply" data-idx="' + idx + '">Apply fix</button></div>'
          );
        })
        .join("");
      body +=
        '<button class="linguaai-acceptall" id="linguaai-accept-all">Accept all (' +
        issues.length + ")</button>";
    }

    resultCard.innerHTML =
      '<div class="linguaai-card-header"><span class="linguaai-card-title">LinguaAI</span>' +
      headerRight +
      "</div><div class=\"linguaai-card-body\">" +
      body +
      "</div>";

    bindCloseButton();
    bindIssueButtons(originalText, data, issues);
  }

  function bindCloseButton() {
    if (!resultCard) return;
    const closeBtn = resultCard.querySelector(".linguaai-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideResultCard();
      });
    }
  }

  function bindIssueButtons(originalText, data, issues) {
    if (!resultCard) return;

    resultCard.querySelectorAll(".linguaai-apply").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        const issue = issues[idx];
        if (!issue || !activeElement) return;
        const ok = applySuggestion(activeElement, issue.original, issue.suggestion);
        if (ok) {
          btn.disabled = true;
          btn.textContent = "Applied";
          btn.closest(".linguaai-issue").style.opacity = "0.45";
        }
      });
    });

    const acceptAllBtn = resultCard.querySelector("#linguaai-accept-all");
    if (acceptAllBtn) {
      acceptAllBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (data.correctedText && activeElement) {
          setElementText(activeElement, data.correctedText);
        } else if (activeElement) {
          let text = getElementText(activeElement);
          for (const issue of issues) {
            const pos = text.indexOf(issue.original);
            if (pos >= 0) {
              text = text.slice(0, pos) + issue.suggestion + text.slice(pos + issue.original.length);
            }
          }
          setElementText(activeElement, text);
        }
        resultCard.innerHTML =
          '<div class="linguaai-card-header"><span class="linguaai-card-title">LinguaAI</span></div>' +
          '<div class="linguaai-card-body"><div class="linguaai-empty"><div class="linguaai-empty-icon">✓</div>' +
          '<div class="linguaai-empty-title">All fixes applied!</div></div></div>';
      });
    }

    const useCorrectedBtn = resultCard.querySelector("#linguaai-use-corrected");
    if (useCorrectedBtn) {
      useCorrectedBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (data.correctedText && activeElement) {
          setElementText(activeElement, data.correctedText);
          resultCard.innerHTML =
            '<div class="linguaai-card-header"><span class="linguaai-card-title">LinguaAI</span></div>' +
            '<div class="linguaai-card-body"><div class="linguaai-empty"><div class="linguaai-empty-icon">✓</div>' +
            '<div class="linguaai-empty-title">Corrected!</div></div></div>';
        }
      });
    }
  }

  // ---------- Analysis ----------
  function handleAnalyze() {
    if (!activeElement) return;
    const text = getElementText(activeElement).trim();
    if (!text) return;
    if (!settings.enabled) return;

    lastAnalyzedText = text;
    showResultCard(activeElement);
    renderCardLoading();
    if (floatingBtn) floatingBtn.classList.add("loading");

    chrome.runtime.sendMessage(
      { type: "LINGUAAI_ANALYZE", text, mode: "full" },
      (resp) => {
        if (floatingBtn) floatingBtn.classList.remove("loading");
        if (chrome.runtime.lastError) {
          renderCardError(chrome.runtime.lastError.message || "Extension error");
          return;
        }
        if (!resp || !resp.ok) {
          renderCardError(resp ? resp.error : "Analysis failed");
          return;
        }
        renderCardResults(text, resp.data);
      }
    );
  }

  // ---------- Event listeners ----------
  function onFocusIn(e) {
    if (!settings.enabled) return;
    const el = e.target;
    if (!isEditable(el)) return;
    activeElement = el;
    showFloatingButton(el);
    if (settings.autoCheck) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const currentText = getElementText(el).trim();
        if (currentText.length >= 5 && currentText !== lastAnalyzedText) {
          handleAnalyze();
        }
      }, 1500);
    }
  }

  function onFocusOut(e) {
    // delay so clicks on FAB/card are not lost
    setTimeout(() => {
      if (document.activeElement === floatingBtn || (resultCard && resultCard.contains(document.activeElement))) {
        return;
      }
      hideFloatingButton();
    }, 200);
  }

  function onScroll() {
    if (activeElement && floatingBtn && floatingBtn.style.display !== "none") {
      positionFloatingButton(activeElement);
    }
    if (activeElement && resultCard && resultCard.style.display !== "none") {
      positionResultCard(activeElement);
    }
  }

  function onResize() {
    onScroll();
  }

  function onInput(e) {
    if (!settings.enabled || !settings.autoCheck) return;
    if (activeElement !== e.target) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const currentText = getElementText(e.target).trim();
      if (currentText.length >= 5 && currentText !== lastAnalyzedText) {
        handleAnalyze();
      }
    }, 1500);
  }

  // Listen for messages from background (e.g. selection check)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "LINGUAAI_CHECK_SELECTION") {
      const sel = window.getSelection ? window.getSelection().toString().trim() : "";
      if (sel) {
        chrome.runtime.sendMessage(
          { type: "LINGUAAI_ANALYZE", text: sel, mode: "full" },
          (resp) => {
            sendResponse(resp);
          }
        );
        return true;
      }
    }
    if (msg?.type === "LINGUAAI_SELECTION_RESULT") {
      const payload = msg.payload;
      if (payload && payload.data) {
        // Show result card near top of viewport
        activeElement = document.activeElement;
        showResultCard(activeElement || document.body);
        renderCardResults(payload.input, payload.data.ok ? payload.data.data : { issues: [], correctedText: payload.input, overallScore: 100 });
      }
    }
    return false;
  });

  // ---------- Init ----------
  function init() {
    loadSettings().then(() => {
      if (settings.enabled === false) return;
      injectStyles();
      document.addEventListener("focusin", onFocusIn, true);
      document.addEventListener("focusout", onFocusOut, true);
      document.addEventListener("input", onInput, true);
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onResize, true);
    });
  }

  init();
})();