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
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.*
import androidx.activity.ComponentActivity
import org.json.JSONObject

/**
 * LinguaAI — Standalone AI Writing Assistant
 *
 * A clean, modern, Grammarly-inspired native Android editor.
 *
 * Design principles:
 *  - White background, subtle gray dividers, emerald accent
 *  - Card-based issue display with colored severity borders
 *  - 16dp rounded corners on all cards
 *  - Clear typography hierarchy (sp units)
 *  - Smooth state transitions (empty → loading → results → error)
 */
class MainActivity : ComponentActivity() {

    private lateinit var api: LinguaAIApi
    private lateinit var handler: Handler

    private lateinit var editor: EditText
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

    // ────────────────────────── Colors ──────────────────────────
    private val colEmerald = Color.parseColor("#10b981")
    private val colEmeraldDark = Color.parseColor("#059669")
    private val colEmeraldLight = Color.parseColor("#d1fae5")
    private val colEmeraldBg = Color.parseColor("#ecfdf5")
    private val colTeal = Color.parseColor("#0d9488")
    private val colWhite = Color.WHITE
    private val colBg = Color.parseColor("#ffffff")
    private val colCardBg = Color.parseColor("#ffffff")
    private val colDivider = Color.parseColor("#f1f5f9")
    private val colBorder = Color.parseColor("#e2e8f0")
    private val colTextPrimary = Color.parseColor("#0f172a")
    private val colTextSecondary = Color.parseColor("#475569")
    private val colTextTertiary = Color.parseColor("#94a3b8")
    private val colCriticalBg = Color.parseColor("#fee2e2")
    private val colCriticalText = Color.parseColor("#b91c1c")
    private val colWarningBg = Color.parseColor("#fef3c7")
    private val colWarningText = Color.parseColor("#92400e")
    private val colSuggestionBg = Color.parseColor("#d1fae5")
    private val colSuggestionText = Color.parseColor("#065f46")
    private val colError = Color.parseColor("#ef4444")
    private val colAmber = Color.parseColor("#f59e0b")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        api = LinguaAIApi(this)
        handler = Handler(Looper.getMainLooper())

        window.apply {
            addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
            statusBarColor = colEmerald
        }

        buildUI()
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

    // ════════════════════════════════════════════════════════════
    //  UI BUILD
    // ════════════════════════════════════════════════════════════

    private fun buildUI() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(colBg)
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT
            )
            layoutParams = params
        }

        root.addView(buildHeader())
        root.addView(buildScoreSection())
        root.addView(buildEditorSection())
        root.addView(buildQuickActionsRow())
        root.addView(buildAICommandBox())
        root.addView(buildLoadingBar())
        root.addView(buildActionsRow())
        root.addView(buildStatsBar())

        resultsScroll = ScrollView(this)
        resultsContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(8), dp(16), dp(16))
        }
        resultsScroll.addView(resultsContainer)
        root.addView(resultsScroll, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1f
        ))

        setContentView(root)
        showEmptyState()
    }

    // ────────────────────── Header ──────────────────────
    private fun buildHeader(): View {
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(20), dp(16) + statusBarHeight(), dp(20), dp(16))
            background = GradientDrawable().apply {
                colors = intArrayOf(colEmerald, colEmeraldDark)
                orientation = GradientDrawable.Orientation.LEFT_RIGHT
            }
        }

        val logoBox = LinearLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(colWhite)
            }
            val lp = LinearLayout.LayoutParams(dp(44), dp(44))
            lp.rightMargin = dp(12)
            layoutParams = lp
            gravity = Gravity.CENTER
        }
        logoBox.addView(TextView(this).apply {
            text = "Aa"
            setTextColor(colEmerald)
            textSize = 18f
            typeface = Typeface.DEFAULT_BOLD
        })
        header.addView(logoBox)

        val titleBox = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        titleBox.addView(TextView(this).apply {
            text = "LinguaAI"
            setTextColor(colWhite)
            textSize = 19f
            typeface = Typeface.DEFAULT_BOLD
        })
        titleBox.addView(TextView(this).apply {
            text = "AI Writing Assistant"
            setTextColor(Color.parseColor("#d1fae5"))
            textSize = 12f
        })
        header.addView(titleBox)

        return header
    }

    // ────────────────────── Score Section ──────────────────────
    private fun buildScoreSection(): View {
        val scoreBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(20), dp(16), dp(20), dp(16))
            setBackgroundColor(colWhite)
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.bottomMargin = dp(1)
            layoutParams = lp
        }

        scoreRing = TextView(this).apply {
            text = "—"
            setTextColor(colEmerald)
            textSize = 22f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(colEmeraldBg)
                setStroke(dp(3), colEmerald)
            }
            val lp = LinearLayout.LayoutParams(dp(56), dp(56))
            lp.rightMargin = dp(14)
            layoutParams = lp
        }
        scoreBar.addView(scoreRing)

        scoreLabel = TextView(this).apply {
            text = "Writing Score\nStart typing to analyze"
            setTextColor(colTextPrimary)
            textSize = 13f
            setLineSpacing(2f, 1f)
        }
        scoreBar.addView(scoreLabel)
        return scoreBar
    }

    // ────────────────────── Editor Section ──────────────────────
    private fun buildEditorSection(): View {
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(12), dp(20), dp(8))
        }

        val label = TextView(this).apply {
            text = "  EDITOR"
            setTextColor(colTextTertiary)
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(0, 0, 0, dp(6))
        }
        container.addView(label)

        editor = EditText(this).apply {
            hint = "Type or paste text to check grammar, spelling, vocabulary, tone, and style...\n\nTip: In any app, select text → Share → LinguaAI to analyze it here."
            setHintTextColor(colTextTertiary)
            setTextColor(colTextPrimary)
            textSize = 15f
            setLineSpacing(4f, 1f)
            background = GradientDrawable().apply {
                cornerRadius = dp(16f)
                setColor(colWhite)
                setStroke(dp(1), colBorder)
            }
            setPadding(dp(16), dp(16), dp(16), dp(16))
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
            lp.bottomMargin = dp(8)
            layoutParams = lp
            gravity = Gravity.TOP
            isVerticalScrollBarEnabled = true
            movementMethod = ScrollingMovementMethod()
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
        container.addView(editor)
        return container
    }

    // ────────────────────── Quick Actions Row ──────────────────────
    private fun buildQuickActionsRow(): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(16), dp(4), dp(16), dp(8))
        }
        pasteBtn = makeSmallButton("Paste") { pasteFromClipboard() }
        row.addView(pasteBtn, buttonParams())
        clipboardBtn = makeSmallButton("Auto-check clipboard") { toggleClipboardMonitor() }
        row.addView(clipboardBtn, buttonParams())
        copyBtn = makeSmallButton("Copy") { copyToClipboard() }
        row.addView(copyBtn, buttonParams())
        clearBtn = makeSmallButton("Clear") { clearEditor() }
        row.addView(clearBtn, buttonParams())
        return row
    }

    // ────────────────────── AI Command Box ──────────────────────
    private fun buildAICommandBox(): View {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(20), dp(4), dp(20), dp(8))
        }
        aiCommandInput = EditText(this).apply {
            hint = "Ask AI: make professional, shorten, translate..."
            setHintTextColor(colTextTertiary)
            setTextColor(colTextPrimary)
            textSize = 13f
            background = GradientDrawable().apply {
                cornerRadius = dp(12f)
                setColor(colWhite)
                setStroke(dp(1), colBorder)
            }
            setPadding(dp(12), dp(10), dp(12), dp(10))
            val lp = LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1f
            )
            lp.weight = 1f
            lp.rightMargin = dp(8)
            layoutParams = lp
        }
        box.addView(aiCommandInput)

        aiCommandBtn = Button(this).apply {
            text = "→"
            setBackgroundColor(colEmerald)
            setTextColor(colWhite)
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
        box.addView(aiCommandBtn)
        return box
    }

    // ────────────────────── Loading Bar ──────────────────────
    private fun buildLoadingBar(): View {
        loadingBar = ProgressBar(this).apply {
            visibility = View.GONE
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(4)
            )
            layoutParams = lp
        }
        return loadingBar
    }

    // ────────────────────── Action Buttons Row ──────────────────────
    private fun buildActionsRow(): View {
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
                setTextColor(colSuggestionText)
                textSize = 12f
                typeface = Typeface.DEFAULT_BOLD
                background = GradientDrawable().apply {
                    cornerRadius = dp(20f)
                    setColor(colEmeraldBg)
                    setStroke(dp(1), colEmerald)
                }
                setPadding(dp(14), dp(9), dp(14), dp(9))
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                lp.rightMargin = dp(8)
                layoutParams = lp
                setOnClickListener { doRewrite(action) }
            }
            actionRow.addView(btn)
        }
        actionScroll.addView(actionRow)
        return actionScroll
    }

    // ────────────────────── Stats Bar ──────────────────────
    private fun buildStatsBar(): View {
        statsBar = TextView(this).apply {
            text = "0 words • 0 characters"
            setTextColor(colTextSecondary)
            textSize = 11f
            setPadding(dp(20), dp(4), dp(20), dp(4))
            background = GradientDrawable().apply {
                setColor(colDivider)
            }
        }
        return statsBar
    }

    // ════════════════════════════════════════════════════════════
    //  ANALYSIS
    // ════════════════════════════════════════════════════════════

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

    // ════════════════════════════════════════════════════════════
    //  RENDER RESULTS
    // ════════════════════════════════════════════════════════════

    private fun renderResults(a: LinguaAIApi.Analysis) {
        resultsContainer.removeAllViews()

        // Summary header card
        val summaryCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(16))
            background = GradientDrawable().apply {
                cornerRadius = dp(16f)
                if (a.issues.isEmpty()) {
                    setColor(colEmeraldBg)
                    setStroke(dp(1), colEmerald)
                } else {
                    setColor(Color.parseColor("#f8fafc"))
                    setStroke(dp(1), colBorder)
                }
            }
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.bottomMargin = dp(12)
            layoutParams = lp
        }

        val summaryText = if (a.issues.isEmpty()) {
            "✓ All clear! No issues found."
        } else {
            "${a.issues.size} issue${if (a.issues.size > 1) "s" else ""} found  •  Tone: ${a.tone}  •  Words: ${a.wordCount}"
        }
        summaryCard.addView(TextView(this).apply {
            text = summaryText
            setTextColor(if (a.issues.isEmpty()) colEmerald else colTextPrimary)
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
        })

        if (a.issues.isNotEmpty()) {
            // Accept all button
            val acceptAllBtn = TextView(this).apply {
                text = "Accept all fixes"
                setTextColor(colWhite)
                textSize = 12f
                typeface = Typeface.DEFAULT_BOLD
                background = GradientDrawable().apply {
                    cornerRadius = dp(10f)
                    setColor(colEmerald)
                }
                setPadding(dp(14), dp(8), dp(14), dp(8))
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                lp.topMargin = dp(10)
                layoutParams = lp
                setOnClickListener {
                    if (a.correctedText.isNotEmpty()) {
                        editor.setText(a.correctedText)
                        currentText = a.correctedText
                        editor.setSelection(a.correctedText.length)
                        toast("All fixes applied")
                        scheduleAnalyze()
                    }
                }
            }
            summaryCard.addView(acceptAllBtn)
        }
        resultsContainer.addView(summaryCard)

        // Issue cards
        for ((idx, issue) in a.issues.withIndex()) {
            resultsContainer.addView(buildIssueCard(issue, idx, a))
        }
    }

    private fun buildIssueCard(issue: LinguaAIApi.Issue, idx: Int, a: LinguaAIApi.Analysis): View {
        val sevColor = when (issue.severity) {
            "critical" -> colCriticalText
            "warning" -> colWarningText
            else -> colSuggestionText
        }
        val sevBg = when (issue.severity) {
            "critical" -> colCriticalBg
            "warning" -> colWarningBg
            else -> colSuggestionBg
        }

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(14), dp(16), dp(14))
            background = GradientDrawable().apply {
                cornerRadius = dp(16f)
                setColor(colCardBg)
                setStroke(dp(1), colBorder)
            }
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.bottomMargin = dp(10)
            layoutParams = lp
            elevation = dp(2f)
        }

        // Badge row
        val badgeRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val badge = TextView(this).apply {
            text = "  ${issue.type.uppercase()}  "
            setTextColor(sevColor)
            textSize = 10f
            typeface = Typeface.DEFAULT_BOLD
            background = GradientDrawable().apply {
                cornerRadius = dp(6f)
                setColor(sevBg)
            }
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.rightMargin = dp(8)
            layoutParams = lp
        }
        badgeRow.addView(badge)

        val sevLabel = TextView(this).apply {
            text = issue.severity
            setTextColor(colTextTertiary)
            textSize = 10f
        }
        badgeRow.addView(sevLabel)
        card.addView(badgeRow)

        // Fix display
        val fix = TextView(this).apply {
            text = "${issue.original}  →  ${issue.suggestion}"
            setTextColor(colTextPrimary)
            textSize = 14f
            setLineSpacing(2f, 1f)
            setPadding(0, dp(8), 0, dp(4))
        }
        card.addView(fix)

        // Explanation
        if (issue.explanation.isNotEmpty()) {
            val explain = TextView(this).apply {
                text = issue.explanation
                setTextColor(colTextSecondary)
                textSize = 12f
                setLineSpacing(1f, 1f)
                setPadding(0, 0, 0, dp(4))
            }
            card.addView(explain)
        }

        // Button row
        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        val replaceBtn = Button(this).apply {
            text = "Replace"
            background = GradientDrawable().apply {
                cornerRadius = dp(10f)
                setColor(colEmerald)
            }
            setTextColor(colWhite)
            textSize = 11f
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.rightMargin = dp(8)
            layoutParams = lp
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
        btnRow.addView(replaceBtn)

        val copyFixBtn = Button(this).apply {
            text = "Copy fix"
            background = GradientDrawable().apply {
                cornerRadius = dp(10f)
                setColor(colDivider)
            }
            setTextColor(colTextSecondary)
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
            setTextColor(colTextSecondary)
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(0, dp(16), 0, dp(8))
        }
    }

    private fun makeSmallButton(label: String, onClick: () -> Unit): Button {
        return Button(this).apply {
            text = label
            background = GradientDrawable().apply {
                cornerRadius = dp(10f)
                setColor(colDivider)
            }
            setTextColor(colTextSecondary)
            textSize = 11f
            setOnClickListener { onClick() }
        }
    }

    private fun buttonParams(): LinearLayout.LayoutParams {
        val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        lp.weight = 1f
        lp.rightMargin = dp(4)
        return lp
    }

    private fun makeLoadingView(): View {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(0, dp(24), 0, dp(24))
            addView(ProgressBar(this@MainActivity).apply {
                val lp = LinearLayout.LayoutParams(dp(32), dp(32))
                lp.bottomMargin = dp(8)
                layoutParams = lp
            })
            addView(TextView(this@MainActivity).apply {
                text = "Analyzing your text..."
                setTextColor(colTextSecondary)
                textSize = 13f
            })
        }
    }

    private fun showEmptyState() {
        resultsContainer.removeAllViews()
        resultsContainer.addView(TextView(this).apply {
            text = "✓\nStart typing to see grammar suggestions.\n\nTip: In any app, select text → Share → LinguaAI to analyze it here."
            setTextColor(colTextTertiary)
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
            setTextColor(colError)
            textSize = 12f
            setPadding(0, dp(16), 0, dp(16))
        })
    }

    private fun updateScoreRing(score: Int, issueCount: Int) {
        scoreRing.text = score.toString()
        val color = when {
            score >= 80 -> colEmerald
            score >= 60 -> colAmber
            else -> colError
        }
        scoreRing.setTextColor(color)
        (scoreRing.background as? GradientDrawable)?.setStroke(dp(3), color)
        scoreLabel.text = "Writing Score\n$issueCount issues found  •  ${currentAnalysis?.tone ?: "—"}"
    }

    private fun updateStats() {
        val words = if (currentText.trim().isEmpty()) 0 else currentText.trim().split(Regex("\\s+")).size
        statsBar.text = "$words words • ${currentText.length} characters"
    }

    // ════════════════════════════════════════════════════════════
    //  AI REWRITE
    // ════════════════════════════════════════════════════════════

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

        val titleLabel = TextView(this).apply {
            text = "AI Rewrite Result"
            setTextColor(colSuggestionText)
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(0, 0, 0, dp(8))
        }
        resultsContainer.addView(titleLabel)

        val resultView = TextView(this).apply {
            text = result
            setTextColor(colTextPrimary)
            textSize = 14f
            setLineSpacing(4f, 1f)
            background = GradientDrawable().apply {
                cornerRadius = dp(12f)
                setColor(colEmeraldBg)
                setStroke(dp(1), colEmerald)
            }
            setPadding(dp(16), dp(16), dp(16), dp(16))
        }
        resultsContainer.addView(resultView)

        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(12), 0, 0)
        }
        val replaceBtn = Button(this).apply {
            text = "Use this"
            background = GradientDrawable().apply {
                cornerRadius = dp(10f)
                setColor(colEmerald)
            }
            setTextColor(colWhite)
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.rightMargin = dp(8)
            layoutParams = lp
            setOnClickListener {
                editor.setText(result)
                editor.setSelection(result.length)
                currentText = result
                toast("Replaced with AI rewrite")
                scheduleAnalyze()
            }
        }
        btnRow.addView(replaceBtn)

        val copyBtn = Button(this).apply {
            text = "Copy"
            background = GradientDrawable().apply {
                cornerRadius = dp(10f)
                setColor(colDivider)
            }
            setTextColor(colTextSecondary)
            setOnClickListener {
                val cm = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(android.content.ClipData.newPlainText("LinguaAI", result))
                toast("Copied")
            }
        }
        btnRow.addView(copyBtn)
        resultsContainer.addView(btnRow)
    }

    // ════════════════════════════════════════════════════════════
    //  CLIPBOARD
    // ════════════════════════════════════════════════════════════

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

    // ════════════════════════════════════════════════════════════
    //  UTILS
    // ════════════════════════════════════════════════════════════

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