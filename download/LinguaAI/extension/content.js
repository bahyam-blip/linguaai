// LinguaAI content script — injects a floating assistant on any text input
// and shows grammar issues inline.

(function () {
  if (window.__linguaaiInjected) return;
  window.__linguaaiInjected = true;

  let floatingButton = null;
  let panelEl = null;
  let debounceTimer = null;
  let lastAnalyzedText = "";
  let activeTarget = null;

  const VALID_INPUTS = 'textarea, input[type="text"], input[type="search"], input[type="email"], input[type="url"], [contenteditable="true"], [contenteditable=""]';

  function debounce(fn, ms) {
    return function (...args) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function getTargetText(el) {
    if (el.isContentEditable) {
      return el.innerText || "";
    }
    return el.value || "";
  }

  function setTargetText(el, newText) {
    if (el.isContentEditable) {
      el.innerText = newText;
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    } else {
      el.value = newText;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function getSelectionRange(el) {
    if (el.isContentEditable) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
        return sel.toString();
      }
      return "";
    }
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    if (end > start) {
      return el.value.substring(start, end);
    }
    return "";
  }

  function positionButton(el) {
    if (!floatingButton) return;
    const rect = el.getBoundingClientRect();
    floatingButton.style.top = `${window.scrollY + rect.top + 8}px`;
    floatingButton.style.left = `${window.scrollX + rect.right - 44}px`;
  }

  function ensureButton() {
    if (floatingButton) return;
    floatingButton = document.createElement("div");
    floatingButton.id = "linguaai-fab";
    floatingButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`;
    floatingButton.title = "LinguaAI — check grammar";
    Object.assign(floatingButton.style, {
      position: "absolute",
      zIndex: "2147483646",
      width: "32px",
      height: "32px",
      background: "white",
      borderRadius: "50%",
      boxShadow: "0 2px 8px rgba(16,185,129,0.3)",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: "2px solid #10b981",
      transition: "transform 0.15s ease",
    });
    floatingButton.addEventListener("mouseenter", () => {
      floatingButton.style.transform = "scale(1.1)";
    });
    floatingButton.addEventListener("mouseleave", () => {
      floatingButton.style.transform = "scale(1)";
    });
    floatingButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeTarget) {
        analyzeAndShowPanel(activeTarget);
      }
    });
    document.documentElement.appendChild(floatingButton);
  }

  function hideButton() {
    if (floatingButton) {
      floatingButton.style.display = "none";
    }
  }

  function showButton(el) {
    ensureButton();
    positionButton(el);
    floatingButton.style.display = "flex";
  }

  function closePanel() {
    if (panelEl) {
      panelEl.remove();
      panelEl = null;
    }
  }

  function analyzeAndShowPanel(el) {
    const text = getSelectionRange(el) || getTargetText(el);
    if (!text || text.trim().length === 0) return;

    closePanel();
    panelEl = createPanel("Analyzing…");
    positionPanel(el);

    chrome.runtime.sendMessage({ type: "LINGUAAI_ANALYZE", text, mode: "full" }, (resp) => {
      if (!panelEl) return;
      if (resp?.ok) {
        renderPanelContent(el, text, resp.data);
      } else {
        panelEl.querySelector(".linguaai-body").innerHTML = `
          <div style="color:#ef4444;font-size:13px;">Analysis failed: ${escapeHtml(resp?.error || "unknown error")}</div>
          <div style="color:#6b7280;font-size:11px;margin-top:6px;">Make sure the LinguaAI app is reachable. You can change the endpoint in extension options.</div>
        `;
      }
    });
  }

  function positionPanel(el) {
    if (!panelEl) return;
    const rect = el.getBoundingClientRect();
    const panelWidth = 360;
    const panelHeight = 420;
    let left = window.scrollX + rect.right - panelWidth;
    if (left < window.scrollX + 8) left = window.scrollX + 8;
    let top = window.scrollY + rect.bottom + 8;
    if (top + panelHeight > window.scrollY + window.innerHeight - 8) {
      top = window.scrollY + rect.top - panelHeight - 8;
    }
    panelEl.style.left = `${left}px`;
    panelEl.style.top = `${top}px`;
  }

  function createPanel(initialBody) {
    const p = document.createElement("div");
    p.id = "linguaai-panel";
    p.innerHTML = `
      <div class="linguaai-header">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-weight:600;font-size:13px;color:#10b981;">LinguaAI</span>
          <span class="linguaai-score" style="font-size:11px;color:#6b7280;"></span>
        </div>
        <button class="linguaai-close" title="Close">×</button>
      </div>
      <div class="linguaai-body">${escapeHtml(initialBody)}</div>
    `;
    Object.assign(p.style, {
      position: "absolute",
      zIndex: "2147483647",
      width: "360px",
      maxHeight: "420px",
      background: "white",
      borderRadius: "12px",
      boxShadow: "0 10px 40px rgba(0,0,0,0.18)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      fontSize: "13px",
      color: "#1f2937",
      overflow: "hidden",
      border: "1px solid #e5e7eb",
    });

    const style = document.createElement("style");
    style.textContent = `
      #linguaai-panel .linguaai-header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:linear-gradient(to right,#ecfdf5,#d1fae5);border-bottom:1px solid #e5e7eb;}
      #linguaai-panel .linguaai-close{background:transparent;border:0;font-size:18px;color:#6b7280;cursor:pointer;padding:0 4px;line-height:1;}
      #linguaai-panel .linguaai-close:hover{color:#1f2937;}
      #linguaai-panel .linguaai-body{padding:10px 12px;max-height:340px;overflow-y:auto;}
      #linguaai-panel .linguaai-issue{border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin-bottom:8px;background:#fafafa;}
      #linguaai-panel .linguaai-issue:hover{border-color:#10b981;}
      #linguaai-panel .linguaai-badge{display:inline-block;font-size:10px;padding:1px 6px;border-radius:8px;margin-right:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.3px;}
      #linguaai-panel .linguaai-badge-critical{background:#fee2e2;color:#b91c1c;}
      #linguaai-panel .linguaai-badge-warning{background:#fef3c7;color:#92400e;}
      #linguaai-panel .linguaai-badge-suggestion{background:#d1fae5;color:#065f46;}
      #linguaai-panel .linguaai-fix{display:flex;align-items:center;gap:6px;margin:4px 0;}
      #linguaai-panel .linguaai-orig{text-decoration:line-through;color:#ef4444;}
      #linguaai-panel .linguaai-new{color:#10b981;font-weight:600;}
      #linguaai-panel .linguaai-explain{font-size:11px;color:#6b7280;margin-top:4px;line-height:1.4;}
      #linguaai-panel .linguaai-accept{background:#10b981;color:white;border:0;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;margin-top:4px;}
      #linguaai-panel .linguaai-accept:hover{background:#059669;}
      #linguaai-panel .linguaai-acceptall{display:block;width:100%;background:#10b981;color:white;border:0;border-radius:6px;padding:8px;font-size:13px;font-weight:600;cursor:pointer;margin-top:8px;}
      #linguaai-panel .linguaai-acceptall:hover{background:#059669;}
      #linguaai-panel .linguaai-empty{text-align:center;padding:20px;color:#10b981;}
    `;
    p.querySelector(".linguaai-close").addEventListener("click", closePanel);
    document.head.appendChild(style);
    document.documentElement.appendChild(p);
    return p;
  }

  function renderPanelContent(el, originalText, data) {
    if (!panelEl) return;
    const scoreEl = panelEl.querySelector(".linguaai-score");
    if (scoreEl && typeof data.overallScore === "number") {
      scoreEl.textContent = `Score: ${data.overallScore}/100`;
    }
    const body = panelEl.querySelector(".linguaai-body");
    const issues = (data.issues || []).filter((i) => i && i.original && i.suggestion);

    if (issues.length === 0) {
      body.innerHTML = `
        <div class="linguaai-empty">
          <div style="font-size:32px;">✓</div>
          <div style="font-weight:600;margin-top:6px;">All clear!</div>
          <div style="font-size:11px;color:#6b7280;margin-top:4px;">No issues detected in the selected text.</div>
        </div>
        ${data.correctedText && data.correctedText !== originalText ? `<button class="linguaai-acceptall" data-action="use-corrected">Use corrected version</button>` : ""}
      `;
      const useBtn = body.querySelector('[data-action="use-corrected"]');
      if (useBtn) {
        useBtn.addEventListener("click", () => {
          setTargetText(el, data.correctedText);
          closePanel();
        });
      }
      return;
    }

    body.innerHTML = issues
      .map(
        (i, idx) => `
      <div class="linguaai-issue" data-idx="${idx}">
        <span class="linguaai-badge linguaai-badge-${i.severity || "suggestion"}">${escapeHtml(i.type || "issue")}</span>
        <div class="linguaai-fix">
          <span class="linguaai-orig">${escapeHtml(i.original)}</span>
          <span style="color:#9ca3af;">→</span>
          <span class="linguaai-new">${escapeHtml(i.suggestion)}</span>
        </div>
        <div class="linguaai-explain">${escapeHtml(i.explanation || "")}</div>
        <button class="linguaai-accept" data-idx="${idx}">Apply fix</button>
      </div>
    `
      )
      .join("") + `<button class="linguaai-acceptall">Accept all (${issues.length})</button>`;

    body.querySelectorAll(".linguaai-accept").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-idx"), 10);
        const issue = issues[idx];
        if (!issue) return;
        const current = getTargetText(el);
        // Apply only the first occurrence of the original substring (case-sensitive)
        const pos = current.indexOf(issue.original);
        if (pos >= 0) {
          const updated = current.slice(0, pos) + issue.suggestion + current.slice(pos + issue.original.length);
          setTargetText(el, updated);
          btn.closest(".linguaai-issue").style.opacity = "0.5";
          btn.disabled = true;
          btn.textContent = "Applied";
        }
      });
    });

    const acceptAllBtn = body.querySelector(".linguaai-acceptall");
    if (acceptAllBtn) {
      acceptAllBtn.addEventListener("click", () => {
        if (data.correctedText) {
          setTargetText(el, data.correctedText);
          closePanel();
        }
      });
    }
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Attach focus listeners
  document.addEventListener(
    "focusin",
    (e) => {
      const t = e.target;
      if (t && t.matches && t.matches(VALID_INPUTS)) {
        activeTarget = t;
        showButton(t);
      }
    },
    true
  );

  document.addEventListener(
    "focusout",
    (e) => {
      // Delay to allow clicking the FAB
      setTimeout(() => {
        if (!document.activeElement || !document.activeElement.matches(VALID_INPUTS)) {
          hideButton();
        }
      }, 200);
    },
    true
  );

  // Reposition on scroll/resize
  window.addEventListener("scroll", () => {
    if (activeTarget && floatingButton && floatingButton.style.display !== "none") {
      positionButton(activeTarget);
    }
    if (panelEl && activeTarget) {
      positionPanel(activeTarget);
    }
  });

  // Listen for keyboard shortcut
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "LINGUAAI_CHECK_SELECTION") {
      const el = document.activeElement;
      if (el && el.matches && el.matches(VALID_INPUTS)) {
        analyzeAndShowPanel(el);
      }
    }
  });

  // Listen for selection result from context menu
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "LINGUAAI_SELECTION_RESULT") {
      const { input, data } = msg.payload;
      panelEl = createPanel("");
      // Position at center-top of viewport
      panelEl.style.left = `${window.scrollX + window.innerWidth / 2 - 180}px`;
      panelEl.style.top = `${window.scrollY + 80}px`;
      renderPanelContent(null, input, data);
    }
  });
})();
