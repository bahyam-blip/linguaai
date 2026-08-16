// LinguaAI Android WebView app — uses fetch() directly against the API endpoint.

// Default endpoint. The Android MainActivity injects window.__LINGUAAI_ENDPOINT__
// before this script runs, if the user has configured a custom endpoint via
// SharedPreferences. Otherwise we fall back to the hosted endpoint.
const API_ENDPOINT =
  (typeof window !== "undefined" && window.__LINGUAAI_ENDPOINT__) ||
  "https://preview-linguaai.space-z.ai/api/grammar";

const editor = document.getElementById("editor");
const scoreBar = document.getElementById("scoreBar");
const scoreValue = document.getElementById("scoreValue");
const scoreRing = document.getElementById("scoreRing");
const scoreIssues = document.getElementById("scoreIssues");
const acceptAllBtn = document.getElementById("acceptAll");
const quickStats = document.getElementById("quickStats");
const issuesCount = document.getElementById("issuesCount");
const vocabCount = document.getElementById("vocabCount");
const pasteBtn = document.getElementById("pasteBtn");

let currentAnalysis = null;
let debounceTimer = null;

const TAB_CONTENTS = {
  issues: document.getElementById("tab-issues"),
  vocab: document.getElementById("tab-vocab"),
  tone: document.getElementById("tab-tone"),
  stats: document.getElementById("tab-stats"),
};

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    tab.classList.add("active");
    TAB_CONTENTS[tab.dataset.tab].classList.add("active");
  });
});

acceptAllBtn.addEventListener("click", () => {
  if (currentAnalysis?.correctedText) {
    editor.value = currentAnalysis.correctedText;
    toast("All fixes applied");
    triggerAnalyze();
  }
});

pasteBtn.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      editor.value = text;
      updateQuickStats();
      triggerAnalyze();
      toast("Pasted from clipboard");
    } else {
      toast("Clipboard is empty");
    }
  } catch (err) {
    toast("Could not read clipboard");
  }
});

editor.addEventListener("input", () => {
  updateQuickStats();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(triggerAnalyze, 900);
});

function updateQuickStats() {
  const text = editor.value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const minutes = words / 200;
  const m = Math.floor(minutes);
  const s = Math.round((minutes - m) * 60);
  const rt = words === 0 ? "0 sec" : m > 0 ? `${m}m ${s}s` : `${s}s`;
  quickStats.textContent = `${words} words · ${text.length} chars · ${rt}`;
}

async function triggerAnalyze() {
  const text = editor.value;
  if (!text.trim()) {
    scoreBar.style.display = "none";
    renderEmpty();
    return;
  }
  showLoading(true);
  try {
    const res = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, mode: "full" }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();
    currentAnalysis = data;
    render(data);
  } catch (err) {
    renderError(err?.message || String(err));
  } finally {
    showLoading(false);
  }
}

function showLoading(show) {
  const bar = document.querySelector(".loading-bar") || (() => {
    const b = document.createElement("div");
    b.className = "loading-bar";
    document.body.appendChild(b);
    return b;
  })();
  bar.classList.toggle("show", show);
}

function renderEmpty() {
  document.getElementById("tab-issues").innerHTML = `
    <div class="empty"><div class="empty-icon">✦</div>
    <p>Start typing to see grammar suggestions.</p></div>`;
  document.getElementById("tab-vocab").innerHTML = "";
  document.getElementById("tab-tone").innerHTML = "";
  document.getElementById("tab-stats").innerHTML = "";
  issuesCount.textContent = "";
  vocabCount.textContent = "";
}

function renderError(msg) {
  document.getElementById("tab-issues").innerHTML = `
    <div class="empty" style="color:#ef4444;">
      <div class="empty-icon">!</div>
      <p>Analysis failed</p>
      <p style="font-size:11px;margin-top:6px;color:#6b7280;">${escapeHtml(msg)}</p>
      <p style="font-size:11px;margin-top:8px;color:#6b7280;">Endpoint: ${escapeHtml(API_ENDPOINT)}</p>
    </div>`;
}

function render(data) {
  scoreBar.style.display = "flex";
  const score = data.overallScore || 0;
  scoreValue.textContent = score;
  scoreValue.style.color = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";
  scoreRing.style.background = `conic-gradient(${
    score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444"
  } ${score * 3.6}deg, #e5e7eb 0)`;

  const issues = (data.issues || []).filter((i) => i && i.original && i.suggestion);
  scoreIssues.textContent = issues.length === 0 ? "No issues found" : `${issues.length} issues found`;
  issuesCount.textContent = issues.length || "";
  vocabCount.textContent = (data.vocabulary || []).length || "";
  acceptAllBtn.style.display = issues.length > 0 ? "block" : "none";

  if (issues.length === 0) {
    document.getElementById("tab-issues").innerHTML = `
      <div class="empty" style="color:#10b981;">
        <div class="empty-icon">✓</div>
        <p>All clear! No issues detected.</p>
      </div>`;
  } else {
    document.getElementById("tab-issues").innerHTML = issues.map((i, idx) => `
      <div class="issue-card">
        <span class="badge badge-${i.severity || "suggestion"}">${escapeHtml(i.type || "issue")}</span>
        <div class="fix">
          <span class="orig">${escapeHtml(i.original)}</span>
          <span style="color:#9ca3af;">→</span>
          <span class="new">${escapeHtml(i.suggestion)}</span>
        </div>
        <div class="explain">${escapeHtml(i.explanation || "")}</div>
        <button class="accept-btn" data-idx="${idx}">Apply fix</button>
      </div>
    `).join("");

    document.querySelectorAll("#tab-issues .accept-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const issue = issues[idx];
        if (!issue) return;
        const pos = editor.value.indexOf(issue.original);
        if (pos >= 0) {
          editor.value =
            editor.value.slice(0, pos) +
            issue.suggestion +
            editor.value.slice(pos + issue.original.length);
          btn.disabled = true;
          btn.textContent = "Applied";
          btn.closest(".issue-card").style.opacity = "0.6";
          updateQuickStats();
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(triggerAnalyze, 600);
        }
      });
    });
  }

  if (!data.vocabulary || data.vocabulary.length === 0) {
    document.getElementById("tab-vocab").innerHTML = `
      <div class="empty" style="color:#10b981;">
        <div class="empty-icon">✓</div>
        <p>Vocabulary is on point.</p>
      </div>`;
  } else {
    document.getElementById("tab-vocab").innerHTML = data.vocabulary.map((v) => `
      <div class="vocab-card">
        <div class="vocab-word">${escapeHtml(v.word)}</div>
        <div class="alt-chips">
          ${(v.alternatives || []).map((a) => `<span class="alt-chip" data-word="${escapeHtml(v.word)}" data-alt="${escapeHtml(a)}">${escapeHtml(a)}</span>`).join("")}
        </div>
        <div class="explain">${escapeHtml(v.reason || "")}</div>
      </div>
    `).join("");
    document.querySelectorAll("#tab-vocab .alt-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const word = chip.dataset.word;
        const alt = chip.dataset.alt;
        const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        const newText = editor.value.replace(regex, alt);
        if (newText !== editor.value) {
          editor.value = newText;
          updateQuickStats();
          toast(`Replaced "${word}" → "${alt}"`);
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(triggerAnalyze, 600);
        }
      });
    });
  }

  if (data.tone) {
    const t = data.tone;
    document.getElementById("tab-tone").innerHTML = `
      <div class="tone-card">
        <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Detected Tone</div>
        <div class="tone-value">${escapeHtml(t.tone || "—")}</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${t.confidence || 0}%"></div></div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;">Confidence: ${t.confidence || 0}%</div>
        <div class="tone-meta">
          <div class="meta-item">
            <div class="meta-label">Formality</div>
            <div class="meta-value">${escapeHtml(t.formality || "—")}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">Sentiment</div>
            <div class="meta-value">${escapeHtml(t.sentiment || "—")}</div>
          </div>
        </div>
      </div>
      ${data.correctedText && data.correctedText !== editor.value ? `
        <div class="tone-card">
          <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Corrected version</div>
          <div style="font-size:13px;color:#374151;line-height:1.5;max-height:160px;overflow-y:auto;">${escapeHtml(data.correctedText)}</div>
          <button class="accept-btn" id="useCorrected" style="margin-top:8px;width:100%;">Use corrected version</button>
        </div>` : ""}
    `;
    const useBtn = document.getElementById("useCorrected");
    if (useBtn) {
      useBtn.addEventListener("click", () => {
        editor.value = data.correctedText;
        updateQuickStats();
        toast("Replaced with corrected version");
        triggerAnalyze();
      });
    }
  }

  if (data.stats) {
    const s = data.stats;
    document.getElementById("tab-stats").innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Words</div><div class="stat-value">${s.wordCount || 0}</div></div>
        <div class="stat-card"><div class="stat-label">Sentences</div><div class="stat-value">${s.sentenceCount || 0}</div></div>
        <div class="stat-card"><div class="stat-label">Unique words</div><div class="stat-value">${s.uniqueWords || 0}</div></div>
        <div class="stat-card"><div class="stat-label">Avg w/s</div><div class="stat-value">${s.averageWordsPerSentence || 0}</div></div>
      </div>
      <div class="stat-card" style="margin-top:8px;">
        <div class="stat-label">Readability (Flesch)</div>
        <div class="stat-value">${(s.readabilityScore || 0).toFixed(0)}</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${s.readabilityScore || 0}%"></div></div>
      </div>
      <div class="stat-card" style="margin-top:8px;">
        <div class="stat-label">Lexical diversity</div>
        <div class="stat-value">${((s.lexicalDiversity || 0) * 100).toFixed(0)}%</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${(s.lexicalDiversity || 0) * 100}%"></div></div>
      </div>
      <div class="stat-card" style="margin-top:8px;">
        <div class="stat-label">Reading time</div>
        <div class="stat-value" style="font-size:15px;">${escapeHtml(s.readingTime || "—")}</div>
      </div>
    `;
  }

  updateQuickStats();
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

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

editor.focus();
