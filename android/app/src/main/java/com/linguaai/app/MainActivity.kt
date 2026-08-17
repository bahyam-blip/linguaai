package com.linguaai.app

import android.accessibilityservice.AccessibilityServiceInfo
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
    private lateinit var scoreLabel: TextView
    private lateinit var statsBar: TextView
    private lateinit var aiCmdInput: EditText
    private lateinit var onboardingBox: LinearLayout
    private lateinit var enableStatus: TextView
    private lateinit var enableBtn: Button
    private lateinit var restrictedBtn: Button
    private lateinit var restrictedInfo: TextView
    private var currentText = ""
    private var currentAnalysis: LinguaAIApi.Analysis? = null
    private var analyzeDebounce: Runnable? = null
    private var clipMonitoring = false
    private var clipRunnable: Runnable? = null
    private var lastClipText = ""

    private val cEm = Color.parseColor("#10b981")
    private val cEmD = Color.parseColor("#059669")
    private val cEmL = Color.parseColor("#d1fae5")
    private val cEmBg = Color.parseColor("#ecfdf5")
    private val cW = Color.WHITE
    private val cBg = Color.parseColor("#ffffff")
    private val cDiv = Color.parseColor("#f1f5f9")
    private val cBd = Color.parseColor("#e2e8f0")
    private val cTP = Color.parseColor("#0f172a")
    private val cTS = Color.parseColor("#475569")
    private val cTT = Color.parseColor("#94a3b8")
    private val cCrBg = Color.parseColor("#fee2e2")
    private val cCrTx = Color.parseColor("#b91c1c")
    private val cWaBg = Color.parseColor("#fef3c7")
    private val cWaTx = Color.parseColor("#92400e")
    private val cSuBg = Color.parseColor("#d1fae5")
    private val cSuTx = Color.parseColor("#065f46")
    private val cErr = Color.parseColor("#ef4444")
    private val cAm = Color.parseColor("#f59e0b")

    override fun onCreate(s: Bundle?) {
        super.onCreate(s)
        api = LinguaAIApi(this)
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
        window.statusBarColor = cEm
        buildUI()
        handleSharedText(intent)
    }
    override fun onNewIntent(i: Intent) { super.onNewIntent(i); handleSharedText(i) }
    override fun onResume() { super.onResume(); updateA11yStatus() }

    private fun handleSharedText(i: Intent?) {
        if (i?.action == Intent.ACTION_SEND && i.type == "text/plain") {
            val t = i.getStringExtra(Intent.EXTRA_TEXT) ?: ""
            if (t.isNotEmpty()) { editor.setText(t); currentText = t; editor.setSelection(t.length); toast("Analyzing..."); triggerAnalyze() }
        }
    }

    private fun buildUI() {
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(cBg) }
        root.addView(buildHeader())
        root.addView(buildOnboarding())
        root.addView(buildScoreBar())
        root.addView(buildEditor())
        root.addView(buildQuickActions())
        root.addView(buildAICmd())
        loadingBar = ProgressBar(this).apply { visibility = View.GONE; layoutParams = LinearLayout.LayoutParams(dp(32), dp(32)).apply { gravity = Gravity.CENTER; setMargins(0, dp(4), 0, dp(4)) } }
        root.addView(LinearLayout(this).apply { gravity = Gravity.CENTER; addView(loadingBar) })
        root.addView(buildActionsRow())
        statsBar = TextView(this).apply { text = "0 words · 0 characters"; setTextColor(cTS); textSize = 11f; setPadding(dp(20), dp(4), dp(20), dp(4)); background = GradientDrawable().apply { setColor(cDiv) } }
        root.addView(statsBar)
        val scroll = ScrollView(this)
        resultsContainer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(8), dp(16), dp(16)) }
        scroll.addView(resultsContainer)
        root.addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)
        showEmpty()
    }

    private fun buildHeader(): View {
        val h = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(20), dp(16) + statusH(), dp(20), dp(16)); background = GradientDrawable().apply { colors = intArrayOf(cEm, cEmD); orientation = GradientDrawable.Orientation.LEFT_RIGHT } }
        val logo = LinearLayout(this).apply { background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(cW) }; layoutParams = LinearLayout.LayoutParams(dp(44), dp(44)).apply { rightMargin = dp(12) } }
        logo.addView(TextView(this).apply { text = "Aa"; setTextColor(cEm); textSize = 18f; typeface = Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER; layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.MATCH_PARENT) })
        h.addView(logo)
        val tb = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        tb.addView(TextView(this).apply { text = "LinguaAI"; setTextColor(cW); textSize = 19f; typeface = Typeface.DEFAULT_BOLD })
        tb.addView(TextView(this).apply { text = "AI Writing Assistant"; setTextColor(cEmL); textSize = 12f })
        h.addView(tb)
        return h
    }

    private fun buildOnboarding(): View {
        onboardingBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(16), dp(20), dp(16)); visibility = View.GONE; background = GradientDrawable().apply { cornerRadius = dp(16).toFloat(); setColor(cEmBg); setStroke(dp(1), cEmL) }; layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { setMargins(dp(16), dp(12), dp(16), dp(4)) } }
        onboardingBox.addView(TextView(this).apply { text = "Enable Floating Assistant"; setTextColor(cEmD); textSize = 15f; typeface = Typeface.DEFAULT_BOLD })
        onboardingBox.addView(TextView(this).apply { text = "Turn on the accessibility service to get real-time grammar, vocabulary, and style suggestions as you type in any app — WhatsApp, Gmail, anywhere. A floating bubble will appear when you're writing."; setTextColor(cTS); textSize = 12f; setLineSpacing(2f, 1f); setPadding(0, dp(6), 0, dp(12)) })
        enableStatus = TextView(this).apply { text = "⚠ Not enabled yet"; setTextColor(cWaTx); textSize = 12f; typeface = Typeface.DEFAULT_BOLD; setPadding(0, 0, 0, dp(8)) }
        restrictedInfo = TextView(this).apply { text = "⚠ Android 13+ Restricted Settings — If the accessibility toggle is greyed out, you need to allow restricted settings first. Tap the button below, then go to: More → Allow restricted settings."; setBackgroundColor(cAm); setTextColor(cWaTx); textSize = 12f; typeface = Typeface.DEFAULT_BOLD; setLineSpacing(2f, 1f); setPadding(dp(10), dp(8), dp(10), dp(8)); visibility = if (Build.VERSION.SDK_INT >= 33) View.VISIBLE else View.GONE }
        onboardingBox.addView(restrictedInfo)
        restrictedBtn = Button(this).apply { text = "Step 1: Allow Restricted Settings"; setBackgroundColor(cAm); setTextColor(cW); textSize = 13f; visibility = if (Build.VERSION.SDK_INT >= 33) View.VISIBLE else View.GONE; layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT); setOnClickListener { openAppInfoForRestrictedSettings() } }
        onboardingBox.addView(restrictedBtn)
        onboardingBox.addView(enableStatus)
        enableBtn = Button(this).apply { text = if (Build.VERSION.SDK_INT >= 33) "Step 2: Open Accessibility Settings" else "Open Accessibility Settings"; setBackgroundColor(cEm); setTextColor(cW); textSize = 13f; layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT); setOnClickListener { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) } }
        onboardingBox.addView(enableBtn)
        return onboardingBox
    }

    private fun openAppInfoForRestrictedSettings() {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:$packageName")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
            Toast.makeText(this, "Tap More (⋮) → Allow restricted settings", Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
            Toast.makeText(this, "Could not open App Info", Toast.LENGTH_SHORT).show()
        }
    }

    private fun buildScoreBar(): View {
        val sb = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(dp(20), dp(16), dp(20), dp(16)); setBackgroundColor(cW) }
        scoreRing = TextView(this).apply { text = "—"; setTextColor(cEm); textSize = 22f; typeface = Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER; background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(cEmBg); setStroke(dp(3), cEm) }; layoutParams = LinearLayout.LayoutParams(dp(56), dp(56)).apply { rightMargin = dp(14) } }
        sb.addView(scoreRing)
        scoreLabel = TextView(this).apply { text = "Writing Score\nStart typing to analyze"; setTextColor(cTP); textSize = 13f; setLineSpacing(2f, 1f) }
        sb.addView(scoreLabel)
        return sb
    }

    private fun buildEditor(): View {
        val c = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(12), dp(20), dp(8)) }
        c.addView(TextView(this).apply { text = "  EDITOR"; setTextColor(cTT); textSize = 11f; setPadding(0, 0, 0, dp(6)) })
        editor = EditText(this).apply {
            hint = "Type or paste text to check grammar, spelling, vocabulary, tone, and style..."; setHintTextColor(cTT); setTextColor(cTP); textSize = 15f; setLineSpacing(4f, 1f)
            background = GradientDrawable().apply { cornerRadius = dp(16).toFloat(); setColor(cW); setStroke(dp(1), cBd) }; setPadding(dp(16), dp(16), dp(16), dp(16)); isVerticalScrollBarEnabled = true; movementMethod = ScrollingMovementMethod.getInstance()
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(180)).apply { bottomMargin = dp(8) }
            addTextChangedListener(object : TextWatcher { override fun beforeTextChanged(s: CharSequence?, st: Int, c: Int, a: Int) {} override fun onTextChanged(s: CharSequence?, st: Int, b: Int, c: Int) {} override fun afterTextChanged(s: Editable?) { currentText = s?.toString() ?: ""; updateStats(); scheduleAnalyze() } })
        }
        c.addView(editor)
        return c
    }

    private fun buildQuickActions(): View {
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(dp(16), dp(4), dp(16), dp(8)) }
        for ((label, action) in listOf("Paste" to { pasteFromClipboard() }, "Auto-clipboard" to { toggleClipMonitor() }, "Copy" to { copyToClipboard() }, "Clear" to { clearEditor() })) {
            row.addView(Button(this).apply { text = label; background = GradientDrawable().apply { cornerRadius = dp(10).toFloat(); setColor(cDiv) }; setTextColor(cTS); textSize = 11f; setOnClickListener { action() } }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { rightMargin = dp(4) })
        }
        return row
    }

    private fun buildAICmd(): View {
        val box = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(dp(20), dp(4), dp(20), dp(8)); gravity = Gravity.CENTER_VERTICAL }
        aiCmdInput = EditText(this).apply { hint = "Ask AI: make professional, shorter, translate..."; setHintTextColor(cTT); setTextColor(cTP); textSize = 13f; background = GradientDrawable().apply { cornerRadius = dp(12).toFloat(); setColor(cW); setStroke(dp(1), cBd) }; setPadding(dp(12), dp(10), dp(12), dp(10)); layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { rightMargin = dp(8) } }
        box.addView(aiCmdInput)
        box.addView(Button(this).apply { text = "→"; setBackgroundColor(cEm); setTextColor(cW); textSize = 16f; layoutParams = LinearLayout.LayoutParams(dp(44), dp(44)); setOnClickListener { val cmd = aiCmdInput.text.toString().trim(); if (cmd.isNotEmpty()) { doRewrite("ai_command", instruction = cmd); aiCmdInput.setText("") } } })
        return box
    }

    private fun buildActionsRow(): View {
        val scroll = HorizontalScrollView(this)
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(dp(16), dp(8), dp(16), dp(8)) }
        for ((label, action) in listOf("Improve" to "improve", "Shorten" to "shorten", "Expand" to "expand", "Simplify" to "simplify", "Professional" to "professional", "Casual" to "casual", "Confident" to "confident", "Friendly" to "friendly", "Concise" to "concise", "Formal" to "formal")) {
            row.addView(TextView(this).apply { text = label; setTextColor(cSuTx); textSize = 12f; background = GradientDrawable().apply { cornerRadius = dp(20).toFloat(); setColor(cEmBg); setStroke(dp(1), cEm) }; setPadding(dp(14), dp(9), dp(14), dp(9)); layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { rightMargin = dp(8) }; setOnClickListener { doRewrite(action) } })
        }
        scroll.addView(row)
        return scroll
    }

    private fun updateA11yStatus() {
        val enabled = isA11yEnabled()
        if (enabled) { onboardingBox.visibility = View.GONE }
        else { onboardingBox.visibility = View.VISIBLE; enableStatus.text = if (Build.VERSION.SDK_INT >= 33) "❌ Not enabled yet — Tap Step 1 below first, then Step 2" else "❌ Not enabled yet — Tap below to turn on"; enableStatus.setTextColor(cWaTx); enableBtn.text = if (Build.VERSION.SDK_INT >= 33) "Step 2: Open Accessibility Settings" else "Open Accessibility Settings" }
    }

    private fun isA11yEnabled(): Boolean {
        val am = getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
        val services = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_GENERIC)
        val expected = ComponentName(this, AssistantAccessibilityService::class.java).flattenToString()
        for (s in services) { val i = s.resolveInfo.serviceInfo; if (ComponentName(i.packageName, i.name).flattenToString() == expected) return true }
        return false
    }

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
        resultsContainer.addView(LinearLayout(this).apply { gravity = Gravity.CENTER; setPadding(0, dp(24), 0, dp(24)); addView(ProgressBar(this@MainActivity).apply { layoutParams = LinearLayout.LayoutParams(dp(32), dp(32)).apply { bottomMargin = dp(8) } }); addView(TextView(this@MainActivity).apply { text = "Analyzing your text..."; setTextColor(cTS); textSize = 13f }) })
        api.analyze(currentText, "general", object : LinguaAIApi.Callback<LinguaAIApi.Analysis> {
            override fun onSuccess(r: LinguaAIApi.Analysis) { loadingBar.visibility = View.GONE; currentAnalysis = r; renderResults(r); updateScoreRing(r.overallScore, r.issues.size) }
            override fun onError(m: String) { loadingBar.visibility = View.GONE; resultsContainer.removeAllViews(); resultsContainer.addView(TextView(this@MainActivity).apply { text = "⚠ Analysis failed: $m\n\nCheck your internet connection and try again."; setTextColor(cErr); textSize = 12f; setPadding(0, dp(16), 0, dp(16)) }) }
        })
    }

    private fun renderResults(a: LinguaAIApi.Analysis) {
        resultsContainer.removeAllViews()
        val summary = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(16), dp(16), dp(16)); background = GradientDrawable().apply { cornerRadius = dp(16).toFloat(); if (a.issues.isEmpty()) { setColor(cEmBg); setStroke(dp(1), cEm) } else { setColor(Color.parseColor("#f8fafc")); setStroke(dp(1), cBd) } }; layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(12) } }
        summary.addView(TextView(this).apply { text = if (a.issues.isEmpty()) "✓ All clear! No issues found." else "${a.issues.size} issue${if (a.issues.size > 1) "s" else ""} found  ·  Tone: ${a.tone}  ·  Words: ${a.wordCount}"; setTextColor(if (a.issues.isEmpty()) cEm else cTP); textSize = 14f })
        if (a.issues.isNotEmpty()) {
            summary.addView(TextView(this).apply { text = "Accept all fixes"; setTextColor(cW); textSize = 12f; gravity = Gravity.CENTER; background = GradientDrawable().apply { cornerRadius = dp(10).toFloat(); setColor(cEm) }; setPadding(dp(14), dp(8), dp(14), dp(8)); setOnClickListener { if (a.correctedText.isNotEmpty()) { editor.setText(a.correctedText); currentText = a.correctedText; editor.setSelection(a.correctedText.length); toast("All fixes applied"); scheduleAnalyze() } } }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(10) })
        }
        resultsContainer.addView(summary)
        for (issue in a.issues) {
            val sevC = when (issue.severity) { "critical" -> cCrTx; "warning" -> cWaTx; else -> cSuTx }
            val sevB = when (issue.severity) { "critical" -> cCrBg; "warning" -> cWaBg; else -> cSuBg }
            val card = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(14), dp(16), dp(14)); background = GradientDrawable().apply { cornerRadius = dp(16).toFloat(); setColor(cBg); setStroke(dp(1), cBd) }; elevation = dp(2).toFloat(); layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(10) } }
            val br = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            br.addView(TextView(this).apply { text = "  ${issue.type.uppercase()}  "; setTextColor(sevC); textSize = 10f; typeface = Typeface.DEFAULT_BOLD; background = GradientDrawable().apply { cornerRadius = dp(6).toFloat(); setColor(sevB) }; setPadding(dp(2), dp(2), dp(2), dp(2)) })
            br.addView(TextView(this).apply { text = "  ${issue.severity}"; setTextColor(cTT); textSize = 10f })
            card.addView(br)
            card.addView(TextView(this).apply { text = "${issue.original}  →  ${issue.suggestion}"; setTextColor(cTP); textSize = 14f; setLineSpacing(2f, 1f); setPadding(0, dp(8), 0, dp(4)) })
            if (issue.explanation.isNotBlank()) card.addView(TextView(this).apply { text = issue.explanation; setTextColor(cTS); textSize = 12f; setLineSpacing(1f, 1f); setPadding(0, 0, 0, dp(8)) })
            val btnRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            btnRow.addView(Button(this).apply { text = "Replace"; background = GradientDrawable().apply { cornerRadius = dp(10).toFloat(); setColor(cEm) }; setTextColor(cW); textSize = 11f; layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { rightMargin = dp(8) }; setOnClickListener { val n = currentText.replaceFirst(issue.original, issue.suggestion, ignoreCase = false); editor.setText(n); val p = n.indexOf(issue.suggestion); editor.setSelection(if (p >= 0) p + issue.suggestion.length else n.length); currentText = n; toast("Replaced"); scheduleAnalyze() } })
            btnRow.addView(Button(this).apply { text = "Copy fix"; background = GradientDrawable().apply { cornerRadius = dp(10).toFloat(); setColor(cDiv) }; setTextColor(cTS); textSize = 11f; setOnClickListener { val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager; cm.setPrimaryClip(ClipData.newPlainText("LinguaAI", issue.suggestion)); toast("Copied: ${issue.suggestion}") } })
            card.addView(btnRow)
            resultsContainer.addView(card)
        }
    }

    private fun doRewrite(action: String, instruction: String? = null, targetLang: String? = null) {
        if (currentText.isBlank()) { toast("Type some text first"); return }
        loadingBar.visibility = View.VISIBLE
        api.rewrite(currentText, action, instruction, targetLang, "general", object : LinguaAIApi.Callback<LinguaAIApi.RewriteResult> {
            override fun onSuccess(r: LinguaAIApi.RewriteResult) { loadingBar.visibility = View.GONE; showRewriteResult(r.result) }
            override fun onError(m: String) { loadingBar.visibility = View.GONE; toast("Rewrite failed: $m") }
        })
    }

    private fun showRewriteResult(result: String) {
        resultsContainer.removeAllViews()
        resultsContainer.addView(TextView(this).apply { text = "AI Rewrite Result"; setTextColor(cSuTx); textSize = 14f; setPadding(0, 0, 0, dp(8)) })
        resultsContainer.addView(TextView(this).apply { text = result; setTextColor(cTP); textSize = 14f; setLineSpacing(4f, 1f); background = GradientDrawable().apply { cornerRadius = dp(12).toFloat(); setColor(cEmBg); setStroke(dp(1), cEm) }; setPadding(dp(16), dp(16), dp(16), dp(16)) })
        val br = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, dp(12), 0, 0) }
        br.addView(Button(this).apply { text = "Use this"; background = GradientDrawable().apply { cornerRadius = dp(10).toFloat(); setColor(cEm) }; setTextColor(cW); textSize = 11f; layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { rightMargin = dp(8) }; setOnClickListener { editor.setText(result); editor.setSelection(result.length); currentText = result; toast("Replaced with AI rewrite"); scheduleAnalyze() } })
        br.addView(Button(this).apply { text = "Copy"; background = GradientDrawable().apply { cornerRadius = dp(10).toFloat(); setColor(cDiv) }; setTextColor(cTS); textSize = 11f; setOnClickListener { val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager; cm.setPrimaryClip(ClipData.newPlainText("LinguaAI", result)); toast("Copied") } })
        resultsContainer.addView(br)
    }

    private fun toggleClipMonitor() {
        if (clipMonitoring) { clipMonitoring = false; clipRunnable?.let { handler.removeCallbacks(it) }; toast("Clipboard monitoring off") }
        else { clipMonitoring = true; toast("Clipboard monitoring on — copy text from any app to analyze it here"); val r = object : Runnable { override fun run() { if (!clipMonitoring) return; checkClipboard(); handler.postDelayed(this, 2000) } }; clipRunnable = r; handler.post(r) }
    }

    private fun checkClipboard() {
        try { val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager; val clip = cm.primaryClip ?: return; if (clip.itemCount == 0) return; val t = clip.getItemAt(0).text?.toString() ?: return; if (t == lastClipText || t == currentText || t.length < 3 || t.length > 10000) return; lastClipText = t; editor.setText(t); currentText = t; editor.setSelection(t.length); toast("Clipboard text loaded — analyzing..."); triggerAnalyze() } catch (_: Exception) {}
    }

    private fun pasteFromClipboard() {
        try { val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager; val clip = cm.primaryClip ?: return; if (clip.itemCount == 0) { toast("Clipboard is empty"); return }; val t = clip.getItemAt(0).text?.toString() ?: ""; if (t.isNotEmpty()) { editor.setText(t); currentText = t; editor.setSelection(t.length); toast("Pasted — analyzing..."); triggerAnalyze() } } catch (e: Exception) { toast("Could not read clipboard") }
    }

    private fun copyToClipboard() { if (currentText.isBlank()) { toast("Nothing to copy"); return }; val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager; cm.setPrimaryClip(ClipData.newPlainText("LinguaAI", currentText)); toast("Copied to clipboard") }
    private fun clearEditor() { editor.setText(""); currentText = ""; currentAnalysis = null; showEmpty(); updateStats() }

    private fun showEmpty() {
        resultsContainer.removeAllViews()
        resultsContainer.addView(TextView(this).apply { text = "✓\nStart typing to see grammar suggestions.\n\nTip: Enable the floating assistant to get suggestions in any app."; setTextColor(cTT); textSize = 12f; gravity = Gravity.CENTER; setPadding(dp(24), dp(24), dp(24), dp(24)); setLineSpacing(4f, 1f) })
        scoreRing.text = "—"; scoreLabel.text = "Writing Score\nStart typing to analyze"
    }

    private fun updateScoreRing(score: Int, count: Int) {
        scoreRing.text = score.toString()
        val color = when { score >= 80 -> cEm; score >= 60 -> cAm; else -> cErr }
        scoreRing.setTextColor(color); (scoreRing.background as? GradientDrawable)?.setStroke(dp(3), color)
        scoreLabel.text = "Writing Score\n$count issue${if (count > 1) "s" else ""} found  ·  ${currentAnalysis?.tone ?: "—"}"
    }

    private fun updateStats() { val w = if (currentText.trim().isEmpty()) 0 else currentText.trim().split(Regex("\\s+")).size; statsBar.text = "$w words · ${currentText.length} characters" }
    private fun dp(v: Int): Int = (v * density).toInt()
    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
    private fun statusH(): Int { val r = resources.getIdentifier("status_bar_height", "dimen", "android"); return if (r > 0) resources.getDimensionPixelSize(r) else 0 }

    override fun onDestroy() { super.onDestroy(); clipRunnable?.let { handler.removeCallbacks(it) }; analyzeDebounce?.let { handler.removeCallbacks(it) } }
}
