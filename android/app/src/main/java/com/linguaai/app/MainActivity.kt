package com.linguaai.app

import android.accessibilityservice.AccessibilityServiceInfo
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
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
import android.provider.Settings
import android.text.Editable
import android.text.TextWatcher
import android.text.method.ScrollingMovementMethod
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.accessibility.AccessibilityManager
import android.view.WindowManager
import android.widget.*
import androidx.activity.ComponentActivity

class MainActivity : ComponentActivity() {

    private lateinit var api: LinguaAIApi
    private val handler = Handler(Looper.getMainLooper())
    private val density by lazy { resources.displayMetrics.density }

    private lateinit var editor: EditText
    private lateinit var resultsContainer: LinearLayout
    private lateinit var loadingBar: ProgressBar
    private lateinit var scoreRing: TextView
    private lateinit var scoreTitle: TextView
    private lateinit var scoreSubtitle: TextView
    private lateinit var statsBar: TextView
    private lateinit var aiCmdInput: EditText
    private lateinit var onboardingCard: LinearLayout
    private lateinit var enableStatus: TextView
    private lateinit var enableBtn: Button
    private lateinit var restrictedBtn: Button

    private var currentText = ""
    private var currentAnalysis: LinguaAIApi.Analysis? = null
    private var analyzeDebounce: Runnable? = null
    private var clipMonitoring = false
    private var clipRunnable: Runnable? = null
    private var lastClipText = ""

    // ---- Design palette ----
    private val cPrimary = Color.parseColor("#10B981")       // primary green
    private val cPrimaryDark = Color.parseColor("#059669")   // dark green
    private val cPrimaryLightBg = Color.parseColor("#ECFDF5") // light green bg
    private val cHeaderSubtitle = Color.parseColor("#D1FAE5")
    private val cWhite = Color.WHITE
    private val cBg = Color.parseColor("#FAFAFA")           // clean white background
    private val cGreyBg = Color.parseColor("#F1F5F9")       // quick action grey
    private val cBorder = Color.parseColor("#E2E8F0")
    private val cTextPrimary = Color.parseColor("#1E293B")
    private val cTextSecondary = Color.parseColor("#64748B")
    private val cMuted = Color.parseColor("#94A3B8")
    private val cGreyText = Color.parseColor("#475569")
    private val cAmber = Color.parseColor("#F59E0B")
    private val cAmberBg = Color.parseColor("#FEF3C7")
    private val cAmberText = Color.parseColor("#92400E")
    private val cChipText = Color.parseColor("#065F46")
    private val cCriticalBg = Color.parseColor("#FEE2E2")
    private val cCriticalTx = Color.parseColor("#B91C1C")
    private val cSuccessBg = Color.parseColor("#D1FAE5")
    private val cSuccessTx = Color.parseColor("#065F46")
    private val cError = Color.parseColor("#EF4444")

    // ---- Lifecycle ----
    override fun onCreate(s: Bundle?) {
        super.onCreate(s)
        api = LinguaAIApi(this)
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
        window.statusBarColor = cPrimaryDark
        buildUI()
        handleSharedText(intent)
    }

    override fun onNewIntent(i: Intent) {
        super.onNewIntent(i)
        handleSharedText(i)
    }

    override fun onResume() {
        super.onResume()
        updateA11yStatus()
    }

    private fun handleSharedText(i: Intent?) {
        if (i?.action == Intent.ACTION_SEND && i.type == "text/plain") {
            val t = i.getStringExtra(Intent.EXTRA_TEXT) ?: ""
            if (t.isNotEmpty()) {
                editor.setText(t)
                currentText = t
                editor.setSelection(t.length)
                toast("Analyzing...")
                triggerAnalyze()
            }
        }
    }

    // ---- UI construction ----
    private fun buildUI() {
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(cBg)
        }
        content.addView(buildHeader())
        content.addView(buildOnboarding())
        content.addView(buildScoreSection())
        content.addView(buildEditor())
        content.addView(buildQuickActions())
        content.addView(buildAICmd())
        content.addView(buildRewriteActions())

        statsBar = TextView(this).apply {
            text = "0 words · 0 characters"
            setTextColor(cMuted)
            textSize = 11f
            setPadding(dp(20), dp(6), dp(20), dp(4))
        }
        content.addView(statsBar)

        loadingBar = ProgressBar(this).apply {
            visibility = View.GONE
            layoutParams = LinearLayout.LayoutParams(dp(32), dp(32)).apply {
                gravity = Gravity.CENTER
                setMargins(0, dp(8), 0, dp(8))
            }
        }
        content.addView(LinearLayout(this).apply { gravity = Gravity.CENTER; addView(loadingBar) })

        resultsContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(4), dp(20), dp(24))
        }
        content.addView(resultsContainer)

        val scroll = ScrollView(this).apply { setBackgroundColor(cBg) }
        scroll.addView(content)
        setContentView(scroll)
        showEmpty()
    }

    private fun buildHeader(): View {
        val h = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(20), dp(16) + statusH(), dp(20), dp(16))
            background = GradientDrawable().apply {
                colors = intArrayOf(cPrimary, cPrimaryDark)
                orientation = GradientDrawable.Orientation.LEFT_RIGHT
            }
        }
        val logo = LinearLayout(this).apply {
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(cWhite) }
            layoutParams = LinearLayout.LayoutParams(dp(44), dp(44)).apply { rightMargin = dp(12) }
        }
        logo.addView(TextView(this).apply {
            text = "Aa"
            setTextColor(cPrimary)
            textSize = 18f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT
            )
        })
        h.addView(logo)
        val tb = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        tb.addView(TextView(this).apply {
            text = "LinguaAI"
            setTextColor(cWhite)
            textSize = 20f
            typeface = Typeface.DEFAULT_BOLD
        })
        tb.addView(TextView(this).apply {
            text = "AI Writing Assistant"
            setTextColor(cHeaderSubtitle)
            textSize = 13f
        })
        h.addView(tb)
        return h
    }

    private fun buildOnboarding(): View {
        onboardingCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(18), dp(20), dp(18))
            visibility = View.GONE
            background = GradientDrawable().apply {
                cornerRadius = dp(16).toFloat()
                setColor(cWhite)
                setStroke(dp(1), cBorder)
            }
            elevation = dp(1).toFloat()
            layoutParams = marginParams(matchWrap, setMargins = intArrayOf(dp(20), dp(16), dp(20), dp(4)))
        }

        onboardingCard.addView(TextView(this).apply {
            text = "Enable Floating Assistant"
            setTextColor(cTextPrimary)
            textSize = 17f
            typeface = Typeface.DEFAULT_BOLD
        })
        onboardingCard.addView(TextView(this).apply {
            text = "Get real-time grammar, vocabulary, and style suggestions as you type in any app."
            setTextColor(cTextSecondary)
            textSize = 13f
            setLineSpacing(dp(2).toFloat(), 0.6f) // ~1.6 line spacing
            setPadding(0, dp(8), 0, dp(14))
        })

        // Amber info banner (Android 13+ only)
        val infoBanner = TextView(this).apply {
            text = "If the accessibility toggle is greyed out, complete Step 1 first to unlock it."
            setTextColor(cAmberText)
            textSize = 12f
            setLineSpacing(dp(2).toFloat(), 0.6f)
            background = GradientDrawable().apply { cornerRadius = dp(10).toFloat(); setColor(cAmberBg) }
            setPadding(dp(12), dp(10), dp(12), dp(10))
            visibility = if (Build.VERSION.SDK_INT >= 33) View.VISIBLE else View.GONE
            layoutParams = marginParams(matchWrap, setMargins = intArrayOf(0, 0, 0, dp(12)))
        }
        onboardingCard.addView(infoBanner)

        // Step 1 button (Android 13+ only)
        restrictedBtn = Button(this).apply {
            text = "Step 1: Unlock Restricted Settings"
            background = roundedDrawable(cAmber, dp(12))
            setTextColor(cWhite)
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            minHeight = dp(48)
            setPadding(dp(20), dp(14), dp(20), dp(14))
            visibility = if (Build.VERSION.SDK_INT >= 33) View.VISIBLE else View.GONE
            layoutParams = marginParams(matchWrap, setMargins = intArrayOf(0, 0, 0, dp(10)))
            setOnClickListener { showRestrictedSettingsDialog() }
        }
        onboardingCard.addView(restrictedBtn)

        // Step 2 button
        enableBtn = Button(this).apply {
            text = "Step 2: Enable Accessibility Service"
            background = roundedDrawable(cPrimary, dp(12))
            setTextColor(cWhite)
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            minHeight = dp(48)
            setPadding(dp(20), dp(14), dp(20), dp(14))
            layoutParams = marginParams(matchWrap, setMargins = intArrayOf(0, 0, 0, dp(10)))
            setOnClickListener { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        }
        onboardingCard.addView(enableBtn)

        // Status text
        enableStatus = TextView(this).apply {
            text = "○ Not enabled"
            setTextColor(cMuted)
            textSize = 12f
        }
        onboardingCard.addView(enableStatus)

        return onboardingCard
    }

    private fun showRestrictedSettingsDialog() {
        AlertDialog.Builder(this)
            .setTitle("Unlock Restricted Settings")
            .setMessage(
                "Android 13+ blocks accessibility for sideloaded apps.\n\n" +
                "Follow these steps:\n\n" +
                "1. On the next screen, tap the three dots (\u22EE) in the top-right corner\n" +
                "2. Tap 'Allow restricted settings'\n" +
                "3. Tap 'Allow' on the warning dialog\n" +
                "4. Return to LinguaAI and tap Step 2"
            )
            .setPositiveButton("Open App Info") { _, _ -> openAppInfoForRestrictedSettings() }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun openAppInfoForRestrictedSettings() {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:$packageName")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
        } catch (e: Exception) {
            toast("Could not open App Info")
        }
    }

    private fun buildScoreSection(): View {
        val section = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(20), dp(20), dp(20), dp(16))
        }
        // Circular score ring (56dp)
        scoreRing = TextView(this).apply {
            text = "—"
            setTextColor(cPrimary)
            textSize = 22f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(cPrimaryLightBg)
                setStroke(dp(3), cPrimary)
            }
            layoutParams = LinearLayout.LayoutParams(dp(56), dp(56)).apply { bottomMargin = dp(8) }
        }
        section.addView(scoreRing)
        scoreTitle = TextView(this).apply {
            text = "Writing Score"
            setTextColor(cTextPrimary)
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        }
        section.addView(scoreTitle)
        scoreSubtitle = TextView(this).apply {
            text = "Start typing to analyze"
            setTextColor(cTextSecondary)
            textSize = 11f
            gravity = Gravity.CENTER
        }
        section.addView(scoreSubtitle)
        return section
    }

    private fun buildEditor(): View {
        val c = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(8), dp(20), dp(8))
        }
        c.addView(TextView(this).apply {
            text = "EDITOR"
            setTextColor(cMuted)
            textSize = 11f
            setLetterSpacingCompat(0.12f)
            setPadding(0, 0, 0, dp(6))
        })
        editor = EditText(this).apply {
            hint = "Type or paste text to check grammar, spelling, vocabulary, tone, and style..."
            setHintTextColor(cMuted)
            setTextColor(cTextPrimary)
            textSize = 15f
            setLineSpacing(dp(4).toFloat(), 1f)
            background = roundedDrawable(cWhite, dp(12)).apply { setStroke(dp(1), cBorder) }
            setPadding(dp(16), dp(16), dp(16), dp(16))
            isVerticalScrollBarEnabled = true
            movementMethod = ScrollingMovementMethod.getInstance()
            minHeight = dp(180)
            layoutParams = marginParams(matchWrap, setMargins = intArrayOf(0, 0, 0, dp(4)))
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, st: Int, c: Int, a: Int) {}
                override fun onTextChanged(s: CharSequence?, st: Int, b: Int, c: Int) {}
                override fun afterTextChanged(s: Editable?) {
                    currentText = s?.toString() ?: ""
                    updateStats()
                    scheduleAnalyze()
                }
            })
        }
        c.addView(editor)
        return c
    }

    private fun buildQuickActions(): View {
        val row = HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            setPadding(dp(20), dp(8), dp(20), dp(8))
        }
        val inner = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for ((label, action) in listOf(
            "Paste" to { pasteFromClipboard() },
            "Auto-clipboard" to { toggleClipMonitor() },
            "Copy" to { copyToClipboard() },
            "Clear" to { clearEditor() }
        )) {
            inner.addView(Button(this).apply {
                text = label
                background = roundedDrawable(cGreyBg, dp(10))
                setTextColor(cGreyText)
                textSize = 11f
                minHeight = dp(36)
                setPadding(dp(14), dp(8), dp(14), dp(8))
                setOnClickListener { action() }
            }, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { rightMargin = dp(8) })
        }
        row.addView(inner)
        return row
    }

    private fun buildAICmd(): View {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(20), dp(4), dp(20), dp(8))
            gravity = Gravity.CENTER_VERTICAL
        }
        aiCmdInput = EditText(this).apply {
            hint = "Ask AI: make professional, shorter, translate..."
            setHintTextColor(cMuted)
            setTextColor(cTextPrimary)
            textSize = 13f
            background = roundedDrawable(cWhite, dp(12)).apply { setStroke(dp(1), cBorder) }
            setPadding(dp(12), dp(10), dp(12), dp(10))
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                rightMargin = dp(8)
            }
        }
        box.addView(aiCmdInput)
        box.addView(Button(this).apply {
            text = "\u2192"
            background = roundedDrawable(cPrimary, dp(12))
            setTextColor(cWhite)
            textSize = 16f
            layoutParams = LinearLayout.LayoutParams(dp(44), dp(44))
            setOnClickListener {
                val cmd = aiCmdInput.text.toString().trim()
                if (cmd.isNotEmpty()) {
                    doRewrite("ai_command", instruction = cmd)
                    aiCmdInput.setText("")
                }
            }
        })
        return box
    }

    private fun buildRewriteActions(): View {
        val scroll = HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            setPadding(dp(20), dp(8), dp(20), dp(12))
        }
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for ((label, action) in listOf(
            "Improve" to "improve", "Shorten" to "shorten", "Expand" to "expand",
            "Simplify" to "simplify", "Professional" to "professional", "Casual" to "casual",
            "Confident" to "confident", "Friendly" to "friendly", "Concise" to "concise",
            "Formal" to "formal"
        )) {
            row.addView(TextView(this).apply {
                text = label
                setTextColor(cChipText)
                textSize = 12f
                background = GradientDrawable().apply {
                    cornerRadius = dp(20).toFloat()
                    setColor(cPrimaryLightBg)
                    setStroke(dp(1), cPrimary)
                }
                setPadding(dp(14), dp(9), dp(14), dp(9))
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { rightMargin = dp(8) }
                setOnClickListener { doRewrite(action) }
            })
        }
        scroll.addView(row)
        return scroll
    }

    // ---- Accessibility ----
    private fun updateA11yStatus() {
        val enabled = isA11yEnabled()
        if (enabled) {
            onboardingCard.visibility = View.GONE
        } else {
            onboardingCard.visibility = View.VISIBLE
            enableStatus.text = "○ Not enabled"
            enableStatus.setTextColor(cMuted)
            enableBtn.text = "Step 2: Enable Accessibility Service"
        }
    }

    private fun isA11yEnabled(): Boolean {
        val am = getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        val services = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_GENERIC)
        val expected = ComponentName(this, AssistantAccessibilityService::class.java).flattenToString()
        for (s in services) {
            val i = s.resolveInfo.serviceInfo
            if (ComponentName(i.packageName, i.name).flattenToString() == expected) return true
        }
        return false
    }

    // ---- Analysis ----
    private fun scheduleAnalyze() {
        analyzeDebounce?.let { handler.removeCallbacks(it) }
        val r = Runnable { if (currentText.trim().length >= 3) triggerAnalyze() }
        analyzeDebounce = r
        handler.postDelayed(r, 1500)
    }

    private fun triggerAnalyze() {
        if (currentText.trim().isEmpty()) { showEmpty(); return }
        loadingBar.visibility = View.VISIBLE
        resultsContainer.removeAllViews()
        resultsContainer.addView(LinearLayout(this).apply {
            gravity = Gravity.CENTER
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(24), 0, dp(24))
            addView(ProgressBar(this@MainActivity).apply {
                layoutParams = LinearLayout.LayoutParams(dp(32), dp(32)).apply { bottomMargin = dp(8) }
            })
            addView(TextView(this@MainActivity).apply {
                text = "Analyzing your text..."
                setTextColor(cTextSecondary)
                textSize = 13f
            })
        })
        api.analyze(currentText, "general", object : LinguaAIApi.Callback<LinguaAIApi.Analysis> {
            override fun onSuccess(r: LinguaAIApi.Analysis) {
                loadingBar.visibility = View.GONE
                currentAnalysis = r
                renderResults(r)
                updateScoreRing(r.overallScore, r.issues.size)
            }
            override fun onError(m: String) {
                loadingBar.visibility = View.GONE
                resultsContainer.removeAllViews()
                resultsContainer.addView(TextView(this@MainActivity).apply {
                    text = "Analysis failed: $m\n\nCheck your internet connection and try again."
                    setTextColor(cError)
                    textSize = 12f
                    setPadding(0, dp(16), 0, dp(16))
                    gravity = Gravity.CENTER
                })
            }
        })
    }

    private fun renderResults(a: LinguaAIApi.Analysis) {
        resultsContainer.removeAllViews()

        // Summary card
        val summary = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(16))
            background = GradientDrawable().apply {
                cornerRadius = dp(16).toFloat()
                if (a.issues.isEmpty()) {
                    setColor(cPrimaryLightBg); setStroke(dp(1), cPrimary)
                } else {
                    setColor(cWhite); setStroke(dp(1), cBorder)
                }
            }
            elevation = dp(1).toFloat()
            layoutParams = marginParams(matchWrap, setMargins = intArrayOf(0, 0, 0, dp(12)))
        }
        summary.addView(TextView(this).apply {
            text = if (a.issues.isEmpty()) "All clear! No issues found."
            else "${a.issues.size} issue${if (a.issues.size > 1) "s" else ""} found  ·  Tone: ${a.tone}  ·  Words: ${a.wordCount}"
            setTextColor(if (a.issues.isEmpty()) cPrimary else cTextPrimary)
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
        })
        if (a.issues.isNotEmpty()) {
            summary.addView(Button(this).apply {
                text = "Accept all fixes"
                background = roundedDrawable(cPrimary, dp(10))
                setTextColor(cWhite)
                textSize = 12f
                typeface = Typeface.DEFAULT_BOLD
                minHeight = dp(40)
                setPadding(dp(14), dp(8), dp(14), dp(8))
                layoutParams = marginParams(wrapWrap, setMargins = intArrayOf(0, dp(10), 0, 0))
                setOnClickListener {
                    if (a.correctedText.isNotEmpty()) {
                        editor.setText(a.correctedText)
                        currentText = a.correctedText
                        editor.setSelection(a.correctedText.length)
                        toast("All fixes applied")
                        scheduleAnalyze()
                    }
                }
            })
        }
        resultsContainer.addView(summary)

        // Individual issue cards
        for (issue in a.issues) {
            val sevC = when (issue.severity) { "critical" -> cCriticalTx; "warning" -> cAmberText; else -> cSuccessTx }
            val sevB = when (issue.severity) { "critical" -> cCriticalBg; "warning" -> cAmberBg; else -> cSuccessBg }

            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(16), dp(14), dp(16), dp(14))
                background = roundedDrawable(cWhite, dp(16)).apply { setStroke(dp(1), cBorder) }
                elevation = dp(1).toFloat()
                layoutParams = marginParams(matchWrap, setMargins = intArrayOf(0, 0, 0, dp(10)))
            }
            val br = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }
            br.addView(TextView(this).apply {
                text = "  ${issue.type.uppercase()}  "
                setTextColor(sevC)
                textSize = 10f
                typeface = Typeface.DEFAULT_BOLD
                background = GradientDrawable().apply { cornerRadius = dp(6).toFloat(); setColor(sevB) }
                setPadding(dp(2), dp(2), dp(2), dp(2))
            })
            br.addView(TextView(this).apply {
                text = "  ${issue.severity}"
                setTextColor(cMuted)
                textSize = 10f
            })
            card.addView(br)
            card.addView(TextView(this).apply {
                text = "${issue.original}  \u2192  ${issue.suggestion}"
                setTextColor(cTextPrimary)
                textSize = 14f
                setLineSpacing(dp(2).toFloat(), 1f)
                setPadding(0, dp(8), 0, dp(4))
            })
            if (issue.explanation.isNotBlank()) {
                card.addView(TextView(this).apply {
                    text = issue.explanation
                    setTextColor(cTextSecondary)
                    textSize = 12f
                    setLineSpacing(dp(1).toFloat(), 1f)
                    setPadding(0, 0, 0, dp(8))
                })
            }
            val btnRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            btnRow.addView(Button(this).apply {
                text = "Replace"
                background = roundedDrawable(cPrimary, dp(10))
                setTextColor(cWhite)
                textSize = 11f
                typeface = Typeface.DEFAULT_BOLD
                minHeight = dp(36)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { rightMargin = dp(8) }
                setOnClickListener {
                    val n = currentText.replaceFirst(issue.original, issue.suggestion, ignoreCase = false)
                    editor.setText(n)
                    val p = n.indexOf(issue.suggestion)
                    editor.setSelection(if (p >= 0) p + issue.suggestion.length else n.length)
                    currentText = n
                    toast("Replaced")
                    scheduleAnalyze()
                }
            })
            btnRow.addView(Button(this).apply {
                text = "Copy"
                background = roundedDrawable(cGreyBg, dp(10))
                setTextColor(cGreyText)
                textSize = 11f
                minHeight = dp(36)
                setOnClickListener {
                    val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    cm.setPrimaryClip(ClipData.newPlainText("LinguaAI", issue.suggestion))
                    toast("Copied: ${issue.suggestion}")
                }
            })
            card.addView(btnRow)
            resultsContainer.addView(card)
        }
    }

    private fun doRewrite(action: String, instruction: String? = null, targetLang: String? = null) {
        if (currentText.isBlank()) { toast("Type some text first"); return }
        loadingBar.visibility = View.VISIBLE
        api.rewrite(currentText, action, instruction, targetLang, "general", object : LinguaAIApi.Callback<LinguaAIApi.RewriteResult> {
            override fun onSuccess(r: LinguaAIApi.RewriteResult) {
                loadingBar.visibility = View.GONE
                showRewriteResult(r.result)
            }
            override fun onError(m: String) {
                loadingBar.visibility = View.GONE
                toast("Rewrite failed: $m")
            }
        })
    }

    private fun showRewriteResult(result: String) {
        resultsContainer.removeAllViews()
        resultsContainer.addView(TextView(this).apply {
            text = "AI Rewrite Result"
            setTextColor(cSuccessTx)
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(0, 0, 0, dp(8))
        })
        resultsContainer.addView(TextView(this).apply {
            text = result
            setTextColor(cTextPrimary)
            textSize = 14f
            setLineSpacing(dp(4).toFloat(), 1f)
            background = GradientDrawable().apply {
                cornerRadius = dp(12).toFloat(); setColor(cPrimaryLightBg); setStroke(dp(1), cPrimary)
            }
            setPadding(dp(16), dp(16), dp(16), dp(16))
        })
        val br = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(12), 0, 0)
        }
        br.addView(Button(this).apply {
            text = "Use this"
            background = roundedDrawable(cPrimary, dp(10))
            setTextColor(cWhite)
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            minHeight = dp(36)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { rightMargin = dp(8) }
            setOnClickListener {
                editor.setText(result)
                editor.setSelection(result.length)
                currentText = result
                toast("Replaced with AI rewrite")
                scheduleAnalyze()
            }
        })
        br.addView(Button(this).apply {
            text = "Copy"
            background = roundedDrawable(cGreyBg, dp(10))
            setTextColor(cGreyText)
            textSize = 11f
            minHeight = dp(36)
            setOnClickListener {
                val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText("LinguaAI", result))
                toast("Copied")
            }
        })
        resultsContainer.addView(br)
    }

    // ---- Clipboard helpers ----
    private fun toggleClipMonitor() {
        if (clipMonitoring) {
            clipMonitoring = false
            clipRunnable?.let { handler.removeCallbacks(it) }
            toast("Clipboard monitoring off")
        } else {
            clipMonitoring = true
            toast("Clipboard monitoring on — copy text from any app to analyze it here")
            val r = object : Runnable {
                override fun run() {
                    if (!clipMonitoring) return
                    checkClipboard()
                    handler.postDelayed(this, 2000)
                }
            }
            clipRunnable = r
            handler.post(r)
        }
    }

    private fun checkClipboard() {
        try {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = cm.primaryClip ?: return
            if (clip.itemCount == 0) return
            val t = clip.getItemAt(0).text?.toString() ?: return
            if (t == lastClipText || t == currentText || t.length < 3 || t.length > 10000) return
            lastClipText = t
            editor.setText(t)
            currentText = t
            editor.setSelection(t.length)
            toast("Clipboard text loaded — analyzing...")
            triggerAnalyze()
        } catch (_: Exception) {}
    }

    private fun pasteFromClipboard() {
        try {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = cm.primaryClip ?: return
            if (clip.itemCount == 0) { toast("Clipboard is empty"); return }
            val t = clip.getItemAt(0).text?.toString() ?: ""
            if (t.isNotEmpty()) {
                editor.setText(t)
                currentText = t
                editor.setSelection(t.length)
                toast("Pasted — analyzing...")
                triggerAnalyze()
            }
        } catch (e: Exception) { toast("Could not read clipboard") }
    }

    private fun copyToClipboard() {
        if (currentText.isBlank()) { toast("Nothing to copy"); return }
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("LinguaAI", currentText))
        toast("Copied to clipboard")
    }

    private fun clearEditor() {
        editor.setText("")
        currentText = ""
        currentAnalysis = null
        showEmpty()
        updateStats()
    }

    private fun showEmpty() {
        resultsContainer.removeAllViews()
        resultsContainer.addView(TextView(this).apply {
            text = "\u270D\nStart typing to see grammar suggestions."
            setTextColor(cMuted)
            textSize = 13f
            gravity = Gravity.CENTER
            setPadding(dp(24), dp(32), dp(24), dp(32))
            setLineSpacing(dp(4).toFloat(), 1f)
        })
        scoreRing.text = "—"
        scoreRing.setTextColor(cPrimary)
        (scoreRing.background as? GradientDrawable)?.setStroke(dp(3), cPrimary)
        scoreSubtitle.text = "Start typing to analyze"
    }

    private fun updateScoreRing(score: Int, count: Int) {
        scoreRing.text = score.toString()
        val color = when { score >= 80 -> cPrimary; score >= 60 -> cAmber; else -> cError }
        scoreRing.setTextColor(color)
        (scoreRing.background as? GradientDrawable)?.setStroke(dp(3), color)
        scoreSubtitle.text = "$count issue${if (count > 1) "s" else ""} found  ·  ${currentAnalysis?.tone ?: "—"}"
    }

    private fun updateStats() {
        val w = if (currentText.trim().isEmpty()) 0 else currentText.trim().split(Regex("\\s+")).size
        statsBar.text = "$w words · ${currentText.length} characters"
    }

    // ---- Helpers ----
    private fun dp(v: Int): Int = (v * density).toInt()
    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
    private fun statusH(): Int {
        val r = resources.getIdentifier("status_bar_height", "dimen", "android")
        return if (r > 0) resources.getDimensionPixelSize(r) else 0
    }

    private val matchWrap = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
    private val wrapWrap = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)

    private fun marginParams(base: LinearLayout.LayoutParams, setMargins: IntArray): LinearLayout.LayoutParams {
        return LinearLayout.LayoutParams(base.width, base.height).apply {
            setMargins(setMargins[0], setMargins[1], setMargins[2], setMargins[3])
        }
    }

    private fun roundedDrawable(fillColor: Int, radius: Int): GradientDrawable {
        return GradientDrawable().apply {
            cornerRadius = radius.toFloat()
            setColor(fillColor)
        }
    }

    private fun TextView.setLetterSpacingCompat(spacing: Float) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            letterSpacing = spacing
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        clipRunnable?.let { handler.removeCallbacks(it) }
        analyzeDebounce?.let { handler.removeCallbacks(it) }
    }
}
