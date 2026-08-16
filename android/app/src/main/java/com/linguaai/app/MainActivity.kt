package com.linguaai.app

import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.text.method.ScrollingMovementMethod
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.*
import androidx.activity.ComponentActivity
import org.json.JSONObject

/**
 * LinguaAI — Standalone AI Writing Assistant
 *
 * A clean, native Android editor that provides:
 *   - Real-time grammar, spelling, punctuation, style, clarity analysis
 *   - Vocabulary suggestions
 *   - Tone detection
 *   - Document scores (grammar, clarity, readability, vocabulary, tone, conciseness, engagement)
 *   - AI rewrite actions (improve, shorten, expand, simplify, professional, casual, etc.)
 *   - Translation to 12 languages
 *   - Ask AI natural-language commands
 *   - Share-sheet integration (receive text from any app)
 *   - Clipboard monitoring (auto-analyze copied text)
 *
 * Only requires INTERNET permission — no Play Protect warnings.
 */
class MainActivity : ComponentActivity() {

    private lateinit var api: LinguaAIApi
    private lateinit var handler: Handler

    private lateinit var editor: EditText
    private lateinit var analyzeBtn: Button
    private lateinit var resultsScroll: ScrollView
    private lateinit var resultsContainer: LinearLayout
    private lateinit var loadingBar: ProgressBar
    private lateinit var scoreRing: TextView
    private lateinit var scoreLabel: TextView
    private lateinit var statsBar: TextView
    private lateinit var aiCommandInput: EditText
    private lateinit var aiCommandBtn: Button
    private lateinit var clipboardBtn: Button
    private lateinit var pasteBtn: Button
    private lateinit var copyBtn: Button
    private lateinit var clearBtn: Button

    private var currentText: String = ""
    private var currentAnalysis: LinguaAIApi.Analysis? = null
    private var analyzeDebounce: Runnable? = null
    private val density by lazy { resources.displayMetrics.density }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        api = LinguaAIApi(this)
        handler = Handler(Looper.getMainLooper())

        // Status bar color
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
        window.statusBarColor = Color.parseColor("#10b981")

        buildUI()

        // Handle incoming shared text
        handleSharedText(intent)
    }

    private fun handleSharedText(intent: Intent?) {
        intent ?: return
        if (intent.action == Intent.ACTION_SEND && intent.type == "text/plain") {
            val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT) ?: ""
            if (sharedText.isNotEmpty()) {
                editor.setText(sharedText)
                currentText = sharedText
                editor.setSelection(sharedText.length)
                toast("Text received — analyzing...")
                triggerAnalyze()
            }
        }
    }

    private fun buildUI() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#fafafa"))
            val params = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.MATCH_PARENT)
            layoutParams = params
        }

        // ===== Header =====
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(16) + statusBarHeight(), dp(16), dp(16))
            background = GradientDrawable().apply {
                colors = intArrayOf(Color.parseColor("#10b981"), Color.parseColor("#0d9488"))
                orientation = GradientDrawable.Orientation.LEFT_RIGHT
            }
        }
        val logoBox = LinearLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.WHITE)
            }
            val lp = LinearLayout.LayoutParams(dp(40), dp(40))
            lp.rightMargin = dp(12)
            layoutParams = lp
            gravity = Gravity.CENTER
        }
        logoBox.addView(TextView(this).apply {
            text = "Aa"
            setTextColor(Color.parseColor("#10b981"))
            textSize = 18f
            typeface = Typeface.DEFAULT_BOLD
        })
        header.addView(logoBox)
        val titleBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        titleBox.addView(TextView(this).apply {
            text = "LinguaAI"
            setTextColor(Color.WHITE)
            textSize = 18f
            typeface = Typeface.DEFAULT_BOLD
        })
        titleBox.addView(TextView(this).apply {
            text = "AI Writing Assistant"
            setTextColor(Color.parseColor("#d1fae5"))
            textSize = 11f
        })
        header.addView(titleBox)
        root.addView(header)

        // ===== Score bar =====
        val scoreBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(12), dp(16), dp(12))
            setBackgroundColor(Color.WHITE)
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.bottomMargin = dp(1)
            layoutParams = lp
        }
        scoreRing = TextView(this).apply {
            text = "—"
            setTextColor(Color.parseColor("#10b981"))
            textSize = 20f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#ecfdf5"))
                setStroke(dp(3), Color.parseColor("#10b981"))
            }
            val lp = LinearLayout.LayoutParams(dp(56), dp(56))
            lp.rightMargin = dp(12)
            layoutParams = lp
        }
        scoreBar.addView(scoreRing)
        scoreLabel = TextView(this).apply {
            text = "Writing Score\nStart typing to analyze"
            setTextColor(Color.parseColor("#1f2937"))
            textSize = 13f
            setLineSpacing(2f, 1f)
        }
        scoreBar.addView(scoreLabel)
        root.addView(scoreBar)

        // ===== Editor =====
        val editorLabel = TextView(this).apply {
            text = "  EDITOR"
            setTextColor(Color.parseColor("#6b7280"))
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(dp(16), dp(12), dp(16), dp(4))
        }
        root.addView(editorLabel)
        editor = EditText(this).apply {
            hint = "Type or paste text to check grammar, spelling, vocabulary, tone, and style...\n\nTip: In any app, select text → Share → LinguaAI to analyze it here."
            setHintTextColor(Color.parseColor("#9ca3af"))
            setTextColor(Color.parseColor("#1f2937"))
            textSize = 15f
            setLineSpacing(4f, 1f)
            background = GradientDrawable().apply {
                cornerRadius = dp(12f)
                setColor(Color.WHITE)
                setStroke(dp(1), Color.parseColor("#e5e7eb"))
            }
            setPadding(dp(16), dp(16), dp(16), dp(16))
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0)
            lp.weight = 1f
            lp.leftMargin = dp(16)
            lp.rightMargin = dp(16)
            lp.bottomMargin = dp(8)
            layoutParams = lp
            gravity = Gravity.TOP
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
                override fun afterTextChanged(s: Editable?) {
                    currentText = s?.toString() ?: ""
                    updateStats()
                    scheduleAnalyze()
                }
            })
        }
        root.addView(editor)

        // ===== Quick action buttons =====
        val quickRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(16), dp(4), dp(16), dp(8))
        }
        pasteBtn = makeSmallButton("Paste") { pasteFromClipboard() }
        quickRow.addView(pasteBtn, buttonParams())
        clipboardBtn = makeSmallButton("Auto-check clipboard") { toggleClipboardMonitor() }
        quickRow.addView(clipboardBtn, buttonParams())
        copyBtn = makeSmallButton("Copy") { copyToClipboard() }
        quickRow.addView(copyBtn, buttonParams())
        clearBtn = makeSmallButton("Clear") { clearEditor() }
        quickRow.addView(clearBtn, buttonParams())
        root.addView(quickRow)

        // ===== AI Command box =====
        val aiBox = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(4), dp(16), dp(8))
        }
        aiCommandInput = EditText(this).apply {
            hint = "Ask AI: make professional, shorten, translate..."
            setHintTextColor(Color.parseColor("#9ca3af"))
            setTextColor(Color.parseColor("#1f2937"))
            textSize = 13f
            background = GradientDrawable().apply {
                cornerRadius = dp(8f)
                setColor(Color.WHITE)
                setStroke(dp(1), Color.parseColor("#e5e7eb"))
            }
            setPadding(dp(12), dp(10), dp(12), dp(10))
            val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.weight = 1f
            lp.rightMargin = dp(8)
            layoutParams = lp
        }
        aiBox.addView(aiCommandInput)
        aiCommandBtn = Button(this).apply {
            text = "→"
            setBackgroundColor(Color.parseColor("#10b981"))
            setTextColor(Color.WHITE)
            textSize = 16f
            typeface = Typeface.DEFAULT_BOLD
            val lp = LinearLayout.LayoutParams(dp(44), dp(44))
            layoutParams = lp
            setOnClickListener {
                val cmd = aiCommandInput.text.toString().trim()
                if (cmd.isNotEmpty()) {
                    doRewrite("ai_command", instruction = cmd)
                    aiCommandInput.setText("")
                }
            }
        }
        aiBox.addView(aiCommandBtn)
        root.addView(aiBox)

        // ===== Loading bar =====
        loadingBar = ProgressBar(this).apply {
            visibility = View.GONE
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(4))
            layoutParams = lp
        }
        root.addView(loadingBar)

        // ===== Action buttons row =====
        val actionScroll = HorizontalScrollView(this)
        val actionRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(16), dp(8), dp(16), dp(8))
        }
        val actions = listOf(
            "Improve" to "improve",
            "Shorten" to "shorten",
            "Expand" to "expand",
            "Simplify" to "simplify",
            "Professional" to "professional",
            "Casual" to "casual",
            "Confident" to "confident",
            "Friendly" to "friendly",
            "Concise" to "concise",
            "Formal" to "formal"
        )
        for ((label, action) in actions) {
            val btn = TextView(this).apply {
                text = label
                setTextColor(Color.parseColor("#065f46"))
                textSize = 12f
                typeface = Typeface.DEFAULT_BOLD
                background = GradientDrawable().apply {
                    cornerRadius = dp(8f)
                    setColor(Color.parseColor("#ecfdf5"))
                    setStroke(dp(1), Color.parseColor("#a7f3d0"))
                }
                setPadding(dp(14), dp(10), dp(14), dp(10))
                val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                lp.rightMargin = dp(8)
                layoutParams = lp
                setOnClickListener { doRewrite(action) }
            }
            actionRow.addView(btn)
        }
        actionScroll.addView(actionRow)
        root.addView(actionScroll)

        // ===== Stats bar =====
        statsBar = TextView(this).apply {
            text = "0 words · 0 characters"
            setTextColor(Color.parseColor("#6b7280"))
            textSize = 11f
            setPadding(dp(16), dp(4), dp(16), dp(4))
        }
        root.addView(statsBar)

        // ===== Results =====
        resultsScroll = ScrollView(this)
        resultsContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(8), dp(16), dp(16))
        }
        resultsScroll.addView(resultsContainer)
        root.addView(resultsScroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(280)))

        setContentView(root)

        // Show empty state
        showEmptyState()
    }

    private fun makeSmallButton(label: String, onClick: () -> Unit): Button {
        return Button(this).apply {
            text = label
            setBackgroundColor(Color.parseColor("#f3f4f6"))
            setTextColor(Color.parseColor("#374151"))
            textSize = 11f
            setOnClickListener { onClick() }
        }
    }

    private fun buttonParams(): LinearLayout.LayoutParams {
        val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT)
        lp.weight = 1f
        lp.rightMargin = dp(4)
        return lp
    }

    // ===== Analysis =====

    private fun scheduleAnalyze() {
        analyzeDebounce?.let { handler.removeCallbacks(it) }
        val r = Runnable {
            if (currentText.trim().length >= 3) {
                triggerAnalyze()
            }
        }
        analyzeDebounce = r
        handler.postDelayed(r, 1500)
    }

    private fun triggerAnalyze() {
        if (currentText.trim().isEmpty()) {
            showEmptyState()
            return
        }
        loadingBar.visibility = View.VISIBLE
        resultsContainer.removeAllViews()
        resultsContainer.addView(makeLoadingView())
        api.analyze(currentText, "general", object : LinguaAIApi.Callback<LinguaAIApi.Analysis> {
            override fun onSuccess(result: LinguaAIApi.Analysis) {
                loadingBar.visibility = View.GONE
                currentAnalysis = result
                renderResults(result)
                updateScoreRing(result.overallScore, result.issues.size)
            }
            override fun onError(message: String) {
                loadingBar.visibility = View.GONE
                renderError(message)
            }
        })
    }

    private fun renderResults(a: LinguaAIApi.Analysis) {
        resultsContainer.removeAllViews()

        // Summary header
        val summary = TextView(this).apply {
            text = if (a.issues.isEmpty()) {
                "✓ All clear! No issues found."
            } else {
                "${a.issues.size} issue${if (a.issues.size > 1) "s" else ""} found · Tone: ${a.tone} · Words: ${a.wordCount}"
            }
            setTextColor(if (a.issues.isEmpty()) Color.parseColor("#10b981") else Color.parseColor("#1f2937"))
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(0, 0, 0, dp(12))
        }
        resultsContainer.addView(summary)

        // Issue cards
        for ((idx, issue) in a.issues.withIndex()) {
            resultsContainer.addView(buildIssueCard(issue, idx, a))
        }

        // Vocabulary section
        if (a.issues.isNotEmpty()) {
            resultsContainer.addView(makeSectionLabel("VOCABULARY"))
        }
    }

    private fun buildIssueCard(issue: LinguaAIApi.Issue, idx: Int, a: LinguaAIApi.Analysis): View {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(14), dp(16), dp(14))
            background = GradientDrawable().apply {
                cornerRadius = dp(12f)
                setColor(Color.parseColor("#fafafa"))
                setStroke(dp(1), Color.parseColor("#e5e7eb"))
            }
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.bottomMargin = dp(10)
            layoutParams = lp
        }

        // Badge
        val sevColor = when (issue.severity) {
            "critical" -> Color.parseColor("#fee2e2") to Color.parseColor("#b91c1c")
            "warning" -> Color.parseColor("#fef3c7") to Color.parseColor("#92400e")
            else -> Color.parseColor("#d1fae5") to Color.parseColor("#065f46")
        }
        val badge = TextView(this).apply {
            text = "  ${issue.type.uppercase()}  "
            setTextColor(sevColor.second)
            textSize = 10f
            typeface = Typeface.DEFAULT_BOLD
            background = GradientDrawable().apply {
                cornerRadius = dp(6f)
                setColor(sevColor.first)
            }
        }
        card.addView(badge)

        // Fix
        val fix = TextView(this).apply {
            text = "${issue.original}  →  ${issue.suggestion}"
            setTextColor(Color.parseColor("#1f2937"))
            textSize = 14f
            setLineSpacing(2f, 1f)
            setPadding(0, dp(8), 0, dp(4))
        }
        card.addView(fix)

        // Explanation
        val explain = TextView(this).apply {
            text = issue.explanation
            setTextColor(Color.parseColor("#6b7280"))
            textSize = 12f
            setPadding(0, 0, 0, dp(10))
        }
        card.addView(explain)

        // Buttons
        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        val replaceBtn = Button(this).apply {
            text = "Replace"
            setBackgroundColor(Color.parseColor("#10b981"))
            setTextColor(Color.WHITE)
            textSize = 11f
            setOnClickListener {
                val pos = currentText.indexOf(issue.original)
                val newText = currentText.replaceFirst(issue.original, issue.suggestion, ignoreCase = false)
                editor.setText(newText)
                val cursorPos = if (pos >= 0) pos + issue.suggestion.length else newText.length
                editor.setSelection(minOf(cursorPos, newText.length))
                currentText = newText
                toast("Replaced")
                scheduleAnalyze()
            }
        }
        btnRow.addView(replaceBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { rightMargin = dp(8) })
        val copyFixBtn = Button(this).apply {
            text = "Copy fix"
            setBackgroundColor(Color.parseColor("#f3f4f6"))
            setTextColor(Color.parseColor("#374151"))
            textSize = 11f
            setOnClickListener {
                val cm = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(android.content.ClipData.newPlainText("LinguaAI", issue.suggestion))
                toast("Copied: ${issue.suggestion}")
            }
        }
        btnRow.addView(copyFixBtn)
        card.addView(btnRow)

        return card
    }

    private fun makeSectionLabel(text: String): TextView {
        return TextView(this).apply {
            this.text = text
            setTextColor(Color.parseColor("#6b7280"))
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(0, dp(16), 0, dp(8))
        }
    }

    private fun makeLoadingView(): View {
        return TextView(this).apply {
            text = "Analyzing your text..."
            setTextColor(Color.parseColor("#6b7280"))
            textSize = 13f
            gravity = Gravity.CENTER
            setPadding(0, dp(24), 0, dp(24))
        }
    }

    private fun showEmptyState() {
        resultsContainer.removeAllViews()
        resultsContainer.addView(TextView(this).apply {
            text = "✦\nStart typing to see grammar suggestions.\n\nTip: In any app, select text → Share → LinguaAI to analyze it here."
            setTextColor(Color.parseColor("#9ca3af"))
            textSize = 12f
            gravity = Gravity.CENTER
            setPadding(dp(24), dp(24), dp(24), dp(24))
            setLineSpacing(4f, 1f)
        })
        scoreRing.text = "—"
        scoreLabel.text = "Writing Score\nStart typing to analyze"
    }

    private fun renderError(msg: String) {
        resultsContainer.removeAllViews()
        resultsContainer.addView(TextView(this).apply {
            text = "⚠ Analysis failed: $msg\n\nCheck your internet connection and try again."
            setTextColor(Color.parseColor("#ef4444"))
            textSize = 12f
            setPadding(0, dp(16), 0, dp(16))
        })
    }

    private fun updateScoreRing(score: Int, issueCount: Int) {
        scoreRing.text = score.toString()
        val color = when {
            score >= 80 -> Color.parseColor("#10b981")
            score >= 60 -> Color.parseColor("#f59e0b")
            else -> Color.parseColor("#ef4444")
        }
        scoreRing.setTextColor(color)
        (scoreRing.background as? GradientDrawable)?.setStroke(dp(3), color)
        scoreLabel.text = "Writing Score\n$issueCount issues found · ${currentAnalysis?.tone ?: "—"}"
    }

    private fun updateStats() {
        val words = if (currentText.trim().isEmpty()) 0 else currentText.trim().split(Regex("\\s+")).size
        statsBar.text = "$words words · ${currentText.length} characters"
    }

    // ===== AI Rewrite =====

    private fun doRewrite(action: String, instruction: String? = null, targetLang: String? = null) {
        if (currentText.isBlank()) {
            toast("Type some text first")
            return
        }
        loadingBar.visibility = View.VISIBLE
        api.rewrite(currentText, action, instruction, targetLang, "general", object : LinguaAIApi.Callback<LinguaAIApi.RewriteResult> {
            override fun onSuccess(result: LinguaAIApi.RewriteResult) {
                loadingBar.visibility = View.GONE
                showRewriteResult(result.result)
            }
            override fun onError(message: String) {
                loadingBar.visibility = View.GONE
                toast("Rewrite failed: $message")
            }
        })
    }

    private fun showRewriteResult(result: String) {
        resultsContainer.removeAllViews()
        resultsContainer.addView(TextView(this).apply {
            text = "AI Rewrite Result"
            setTextColor(Color.parseColor("#064e3b"))
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(0, 0, 0, dp(8))
        })
        resultsContainer.addView(TextView(this).apply {
            text = result
            setTextColor(Color.parseColor("#1f2937"))
            textSize = 14f
            setLineSpacing(4f, 1f)
            background = GradientDrawable().apply {
                cornerRadius = dp(12f)
                setColor(Color.parseColor("#ecfdf5"))
                setStroke(dp(1), Color.parseColor("#a7f3d0"))
            }
            setPadding(dp(16), dp(16), dp(16), dp(16))
        })
        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(12), 0, 0)
        }
        val replaceBtn = Button(this).apply {
            text = "Use this"
            setBackgroundColor(Color.parseColor("#10b981"))
            setTextColor(Color.WHITE)
            setOnClickListener {
                editor.setText(result)
                editor.setSelection(result.length)
                currentText = result
                toast("Replaced with AI rewrite")
                scheduleAnalyze()
            }
        }
        btnRow.addView(replaceBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { rightMargin = dp(8) })
        val copyBtn = Button(this).apply {
            text = "Copy"
            setBackgroundColor(Color.parseColor("#f3f4f6"))
            setTextColor(Color.parseColor("#374151"))
            setOnClickListener {
                val cm = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(android.content.ClipData.newPlainText("LinguaAI", result))
                toast("Copied")
            }
        }
        btnRow.addView(copyBtn)
        resultsContainer.addView(btnRow)
    }

    // ===== Clipboard =====

    private var clipboardMonitoring = false
    private var clipboardCheckRunnable: Runnable? = null

    private fun toggleClipboardMonitor() {
        if (clipboardMonitoring) {
            clipboardMonitoring = false
            clipboardCheckRunnable?.let { handler.removeCallbacks(it) }
            clipboardBtn.text = "Auto-check clipboard"
            toast("Clipboard monitoring off")
        } else {
            clipboardMonitoring = true
            clipboardBtn.text = "Stop clipboard monitor"
            toast("Clipboard monitoring on — copy text from any app to analyze it here")
            startClipboardMonitor()
        }
    }

    private fun startClipboardMonitor() {
        val r = object : Runnable {
            override fun run() {
                if (!clipboardMonitoring) return
                checkClipboard()
                handler.postDelayed(this, 2000)
            }
        }
        clipboardCheckRunnable = r
        handler.post(r)
    }

    private var lastClipboardText: String = ""
    private fun checkClipboard() {
        try {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = cm.primaryClip ?: return
            if (clip.itemCount == 0) return
            val text = clip.getItemAt(0).text?.toString() ?: return
            if (text == lastClipboardText || text == currentText) return
            if (text.length < 3 || text.length > 10000) return
            lastClipboardText = text
            editor.setText(text)
            currentText = text
            editor.setSelection(text.length)
            toast("Clipboard text loaded — analyzing...")
            triggerAnalyze()
        } catch (_: Exception) {}
    }

    private fun pasteFromClipboard() {
        try {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = cm.primaryClip ?: return
            if (clip.itemCount == 0) {
                toast("Clipboard is empty")
                return
            }
            val text = clip.getItemAt(0).text?.toString() ?: ""
            if (text.isNotEmpty()) {
                editor.setText(text)
                currentText = text
                editor.setSelection(text.length)
                toast("Pasted — analyzing...")
                triggerAnalyze()
            }
        } catch (e: Exception) {
            toast("Could not read clipboard")
        }
    }

    private fun copyToClipboard() {
        if (currentText.isBlank()) {
            toast("Nothing to copy")
            return
        }
        val cm = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(android.content.ClipData.newPlainText("LinguaAI", currentText))
        toast("Copied to clipboard")
    }

    private fun clearEditor() {
        editor.setText("")
        currentText = ""
        currentAnalysis = null
        showEmptyState()
        updateStats()
    }

    // ===== Utils =====

    private fun dp(v: Int): Int = (v * density).toInt()
    private fun dp(v: Float): Float = v * density
    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    private fun statusBarHeight(): Int {
        val res = resources.getIdentifier("status_bar_height", "dimen", "android")
        return if (res > 0) resources.getDimensionPixelSize(res) else 0
    }

    override fun onDestroy() {
        clipboardCheckRunnable?.let { handler.removeCallbacks(it) }
        super.onDestroy()
    }
}
