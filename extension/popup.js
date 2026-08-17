const editor = document.getElementById("editor");
const analyzeBtn = document.getElementById("analyzeBtn");
const resultsEl = document.getElementById("results");
const statusBar = document.getElementById("statusBar");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const settingsBtn = document.getElementById("settingsBtn");
const optionsLink = document.getElementById("optionsLink");

async function checkStatus() {
  const { linguaaiApiKey = "" } = await chrome.storage.sync.get("linguaaiApiKey");
  if (!linguaaiApiKey) {
    statusDot.className = "status-dot error";
    statusText.textContent = "No API key — open Options to add your Sarvam AI key";
    analyzeBtn.disabled = true;
    return false;
  }
  statusDot.className = "status-dot connected";
  statusText.textContent = "Connected to Sarvam AI";
  analyzeBtn.disabled = false;
  return true;
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, """).replace(/'/g, "&#039;");
}

function analyze() {
  const text = editor.value.trim();
  if (!text) return;
  resultsEl.innerHTML = '<div class="result-loading"><div class="spinner"></div>Analyzing your text…</div>';
  analyzeBtn.disabled = true;
  chrome.runtime.sendMessage({ type: "LINGUAAI_ANALYZE", text, mode: "full" }, (resp) => {
    analyzeBtn.disabled = false;
    if (!resp?.ok) {
      resultsEl.innerHTML = '<div class="result-error">Analysis failed: ' + escapeHtml(resp?.error || "unknown error") + '</div><div class="result-error-sub">Make sure your Sarvam AI API key is set in Options.</div>';
      return;
    }
    renderResults(text, resp.data);
  });
}

function renderResults(originalText, data) {
  const issues = (data.issues || []).filter((i) => i && i.original && i.suggestion);
  let html = "";
  if (typeof data.overallScore === "number") {
    html += '<div class="score-bar"><span class="score-label">Writing Score</span><span class="score-value">' + data.overallScore + '/100</span></div>';
  }
  if (issues.length === 0) {
    html += '<div class="result-empty"><div class="result-empty-icon">✓</div><div class="result-empty-title">All clear!</div><div class="result-empty-sub">No issues detected in your text.</div></div>';
    if (data.correctedText && data.correctedText !== originalText) {
      html += '<button class="accept-all" id="useCorrected">Use corrected version</button>';
    }
    resultsEl.innerHTML = html;
    const useBtn = document.getElementById("useCorrected");
    if (useBtn) {
      useBtn.addEventListener("click", () => {
        editor.value = data.correctedText;
        resultsEl.innerHTML = '<div class="result-empty"><div class="result-empty-icon">✓</div><div class="result-empty-title">Corrected!</div></div>';
      });
    }
    return;
  }
  html += issues.map((i, idx) => '<div class="issue-card" data-idx="' + idx + '"><span class="issue-badge badge-' + (i.severity || "suggestion") + '">' + escapeHtml(i.type || "issue") + '</span><div class="issue-fix"><span class="fix-orig">' + escapeHtml(i.original) + '</span><span class="fix-arrow">→</span><span class="fix-new">' + escapeHtml(i.suggestion) + '</span></div>' + (i.explanation ? '<div class="issue-explain">' + escapeHtml(i.explanation) + '</div>' : "") + '<button class="issue-accept" data-idx="' + idx + '">Apply fix</button></div>').join("");
  html += '<button class="accept-all" id="acceptAll">Accept all (' + issues.length + ')</button>';
  resultsEl.innerHTML = html;
  resultsEl.querySelectorAll(".issue-accept").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-idx"), 10);
      const issue = issues[idx];
      if (!issue) return;
      const current = editor.value;
      const pos = current.indexOf(issue.original);
      if (pos >= 0) {
        editor.value = current.slice(0, pos) + issue.suggestion + current.slice(pos + issue.original.length);
        btn.closest(".issue-card").style.opacity = "0.4";
        btn.disabled = true;
        btn.textContent = "Applied";
      }
    });
  });
  const acceptAllBtn = document.getElementById("acceptAll");
  if (acceptAllBtn) {
    acceptAllBtn.addEventListener("click", () => {
      if (data.correctedText) {
        editor.value = data.correctedText;
      } else {
        let text = editor.value;
        for (const issue of issues) {
          const pos = text.indexOf(issue.original);
          if (pos >= 0) {
            text = text.slice(0, pos) + issue.suggestion + text.slice(pos + issue.original.length);
          }
        }
        editor.value = text;
      }
      resultsEl.innerHTML = '<div class="result-empty"><div class="result-empty-icon">✓</div><div class="result-empty-title">All fixes applied!</div></div>';
    });
  }
}

analyzeBtn.addEventListener("click", analyze);
editor.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    analyze();
  }
});
settingsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());
optionsLink.addEventListener("click", () => chrome.runtime.openOptionsPage());
checkStatus();
editor.focus();