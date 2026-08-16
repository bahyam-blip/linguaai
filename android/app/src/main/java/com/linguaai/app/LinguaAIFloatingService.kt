package com.linguaai.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.DisplayMetrics
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.widget.*
import org.json.JSONObject
import kotlin.math.abs

/**
 * LinguaAIFloatingService
 *
 * Foreground service that owns the floating overlay UI:
 *   1. A small floating bubble (drag to move, tap to expand)
 *      States: Inactive / Analyzing / IssuesFound(n) / NoIssues
 *   2. An expandable panel with grammar suggestions and AI actions:
 *      Improve / Rewrite / Shorten / Expand / Simplify / Change Tone / Translate / Explain / Ask AI
 *   3. Per-suggestion Replace / Ignore / Explain UI
 *
 * Listens for FLOATING_SIGNAL broadcasts from the accessibility service to know
 * what text the user is currently editing.
 *
 * Requires SYSTEM_ALERT_WINDOW permission (granted by the user via Settings).
 */
class LinguaAIFloatingService : Service() {
    private lateinit var wm: WindowManager
    private lateinit var handler: Handler
    private lateinit var api: LinguaAIApi

    private var bubble: View? = null
    private var bubbleBadge: TextView? = null
    private var panel: LinearLayout? = null
    private var panelContainer: View? = null
    private var bubbleParams: WindowManager.LayoutParams? = null
    private var panelParams: WindowManager.LayoutParams? = null

    private var currentText: String = ""
    private var currentPackage: String = ""
    private var currentAnalysis: LinguaAIApi.Analysis? = null
    private var currentIssueIndex: Int = 0
    private var isPanelExpanded: Boolean = false
    private var analyzeDebounce: Runnable? = null

    private val signalReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            intent ?: return
            val signalStr = intent.getStringExtra("signal") ?: return
            val pkg = intent.getStringExtra("package") ?: ""
            val text = intent.getStringExtra("text") ?: ""
            val signal = runCatching {
                FloatingSignal.valueOf(signalStr)
            }.getOrNull() ?: return

            handler.post { handleSignal(signal, pkg, text) }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        handler = Handler(Looper.getMainLooper())
        api = LinguaAIApi(this)

        // Register broadcast receiver
        val filter = IntentFilter("com.linguaai.app.FLOATING_SIGNAL")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(signalReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(signalReceiver, filter)
        }

        startForeground(NOTIF_ID, buildNotification())
        ensureBubble()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onDestroy() {
        try { unregisterReceiver(signalReceiver) } catch (_: Exception) {}
        hidePanel()
        hideBubble()
        super.onDestroy()
    }

    // ---------- Signal handling ----------

    private fun handleSignal(signal: FloatingSignal, pkg: String, text: String) {
        when (signal) {
            FloatingSignal.Show -> {
                currentPackage = pkg
                if (text.isNotEmpty()) currentText = text
                if (AppSettings.isFloatingHidden(this)) return
                showBubble(state = BubbleState.Inactive)
            }
            FloatingSignal.Analyze -> {
                currentPackage = pkg
                currentText = text
                if (AppSettings.isFloatingHidden(this)) return
                showBubble(state = BubbleState.Analyzing)
                scheduleAnalyze()
            }
            FloatingSignal.Hide -> {
                hidePanel()
                hideBubble()
            }
        }
    }

    private fun scheduleAnalyze() {
        analyzeDebounce?.let { handler.removeCallbacks(it) }
        val r = Runnable {
            if (currentText.isBlank()) return@Runnable
            showBubble(state = BubbleState.Analyzing)
            val goal = AppSettings.getPerApp(this, currentPackage).let {
                if (it.goal != "general") it.goal else AppSettings.defaultGoalFor(currentPackage)
            }
            api.analyze(currentText, goal, object : LinguaAIApi.Callback<LinguaAIApi.Analysis> {
                override fun onSuccess(result: LinguaAIApi.Analysis) {
                    currentAnalysis = result
                    currentIssueIndex = 0
                    if (result.issues.isEmpty()) {
                        showBubble(state = BubbleState.NoIssues)
                    } else {
                        showBubble(BubbleState.IssuesFound, result.issues.size)
                    }
                    if (isPanelExpanded) renderPanel()
                }
                override fun onError(message: String) {
                    Log.w(TAG, "analyze error: $message")
                    showBubble(state = BubbleState.Inactive)
                    if (isPanelExpanded) renderPanelError(message)
                }
            })
        }
        analyzeDebounce = r
        handler.postDelayed(r, 1200)
    }

    // ---------- Bubble ----------

    enum class BubbleState { Inactive, Analyzing, IssuesFound, NoIssues }

    private fun showBubble(state: BubbleState, issueCount: Int = 0) {
        ensureBubble()
        val b = bubble ?: return
        when (state) {
            BubbleState.Inactive -> {
                bubbleBadge?.visibility = View.GONE
                b.alpha = 0.7f
            }
            BubbleState.Analyzing -> {
                bubbleBadge?.visibility = View.GONE
                b.alpha = 1.0f
            }
            BubbleState.NoIssues -> {
                bubbleBadge?.visibility = View.GONE
                b.alpha = 0.5f
            }
            BubbleState.IssuesFound -> {
                bubbleBadge?.apply {
                    visibility = View.VISIBLE
                    text = issueCount.toString()
                }
                b.alpha = 1.0f
            }
        }
    }

    private fun ensureBubble() {
        if (bubble != null) return
        val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            PixelFormat.TRANSLUCENT
        )
        params.gravity = Gravity.TOP or Gravity.START

        // Restore saved position
        val (savedX, savedY) = AppSettings.getFloatingPos(this)
        val dm = DisplayMetrics()
        wm.defaultDisplay.getMetrics(dm)
        params.x = if (savedX >= 0) savedX else dm.widthPixels - 120
        params.y = if (savedY >= 0) savedY else 200
        bubbleParams = params

        val size = AppSettings.getButtonSize(this)
        val container = FrameLayout(this).apply {
            val bg = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                colors = intArrayOf(Color.parseColor("#10b981"), Color.parseColor("#0d9488"))
                orientation = GradientDrawable.Orientation.TOP_BOTTOM
            }
            background = bg
            elevation = 12f
        }
        val pad = (size * 0.22f).toInt()
        container.setPadding(pad, pad, pad, pad)

        // SVG-like icon drawn as a TextView "Aa" in white
        val icon = TextView(this).apply {
            text = "Aa"
            setTextColor(Color.WHITE)
            textSize = size * 0.32f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        }
        container.addView(icon, FrameLayout.LayoutParams(size, size).apply {
            gravity = Gravity.CENTER
        })

        // Badge for issue count
        val badge = TextView(this).apply {
            setBackgroundResource(android.R.drawable.presence_online) // green dot fallback
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#ef4444"))
            }
            setTextColor(Color.WHITE)
            textSize = 9f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            visibility = View.GONE
            elevation = 14f
        }
        val badgeSize = (size * 0.55f).toInt()
        container.addView(badge, FrameLayout.LayoutParams(badgeSize, badgeSize).apply {
            gravity = Gravity.TOP or Gravity.END
            marginEnd = -(badgeSize / 4)
            topMargin = -(badgeSize / 4)
        })
        bubbleBadge = badge

        // Drag + tap handling
        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f
        var moved = false
        container.setOnTouchListener { v, ev ->
            when (ev.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = ev.rawX
                    initialTouchY = ev.rawY
                    moved = false
                    v.animate().scaleX(1.1f).scaleY(1.1f).setDuration(100).start()
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = ev.rawX - initialTouchX
                    val dy = ev.rawY - initialTouchY
                    if (abs(dx) > 10 || abs(dy) > 10) moved = true
                    params.x = initialX + dx.toInt()
                    params.y = initialY + dy.toInt()
                    try { wm.updateViewLayout(container, params) } catch (_: Exception) {}
                    true
                }
                MotionEvent.ACTION_UP -> {
                    v.animate().scaleX(1f).scaleY(1f).setDuration(100).start()
                    // Save final position
                    AppSettings.setFloatingPos(this@LinguaAIFloatingService, params.x, params.y)
                    if (!moved) {
                        // Tap — expand panel
                        togglePanel()
                    }
                    true
                }
                else -> false
            }
        }

        try {
            wm.addView(container, params)
            bubble = container
        } catch (e: Exception) {
            Log.e(TAG, "Failed to add bubble view — overlay permission not granted?", e)
        }
    }

    private fun hideBubble() {
        bubble?.let {
            try { wm.removeView(it) } catch (_: Exception) {}
        }
        bubble = null
        bubbleBadge = null
    }

    // ---------- Panel ----------

    private fun togglePanel() {
        if (isPanelExpanded) hidePanel() else showPanel()
    }

    private fun showPanel() {
        if (panel != null) return
        val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

        val dm = DisplayMetrics()
        wm.defaultDisplay.getMetrics(dm)
        val panelWidth = (dm.widthPixels * 0.85f).toInt().coerceAtMost(720)
        val panelHeight = (dm.heightPixels * 0.65f).toInt().coerceAtMost(640)

        val params = WindowManager.LayoutParams(
            panelWidth,
            panelHeight,
            layoutType,
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.TRANSLUCENT
        )
        params.gravity = Gravity.CENTER
        params.dimAmount = 0.15f
        panelParams = params

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = GradientDrawable().apply {
                cornerRadius = 28f
                setColor(Color.WHITE)
                setStroke(1, Color.parseColor("#e5e7eb"))
            }
            elevation = 24f
            clipToOutline = true
        }
        // Header
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(40, 28, 28, 28)
            gravity = Gravity.CENTER_VERTICAL
            background = GradientDrawable().apply {
                cornerRadii = floatArrayOf(28f, 28f, 28f, 28f, 0f, 0f, 0f, 0f)
                colors = intArrayOf(Color.parseColor("#ecfdf5"), Color.parseColor("#d1fae5"))
                orientation = GradientDrawable.Orientation.LEFT_RIGHT
            }
        }
        val logo = TextView(this).apply {
            text = "Aa"
            setTextColor(Color.WHITE)
            textSize = 18f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                colors = intArrayOf(Color.parseColor("#10b981"), Color.parseColor("#0d9488"))
                orientation = GradientDrawable.Orientation.TOP_BOTTOM
            }
            gravity = Gravity.CENTER
        }
        val logoSize = (28 * resources.displayMetrics.density).toInt()
        header.addView(logo, LinearLayout.LayoutParams(logoSize, logoSize).apply { rightMargin = 24 })
        val title = TextView(this).apply {
            text = "LinguaAI"
            setTextColor(Color.parseColor("#064e3b"))
            textSize = 16f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }
        header.addView(title, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        val closeBtn = TextView(this).apply {
            text = "✕"
            setTextColor(Color.parseColor("#6b7280"))
            textSize = 20f
            setPadding(24, 8, 8, 24)
            setOnClickListener { hidePanel() }
        }
        header.addView(closeBtn)
        root.addView(header, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        // Body — scrollable content
        val scroll = ScrollView(this)
        val body = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(28, 24, 28, 28)
        }
        scroll.addView(body)
        root.addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        panel = body

        try {
            wm.addView(root, params)
            panelContainer = root
            isPanelExpanded = true
            renderPanel()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to add panel view", e)
        }
    }

    private fun hidePanel() {
        panelContainer?.let {
            try { wm.removeView(it) } catch (_: Exception) {}
        }
        panel = null
        panelContainer = null
        isPanelExpanded = false
    }

    private fun renderPanel() {
        val body = panel ?: return
        body.removeAllViews()

        // Issue count header
        val a = currentAnalysis
        val headerText = TextView(this).apply {
            textSize = 13f
            setTextColor(Color.parseColor("#6b7280"))
            setPadding(0, 0, 0, 16)
        }
        if (a == null) {
            headerText.text = "Analyzing your text..."
            body.addView(headerText)
            // AI actions row
            addAiActions(body, enabled = false)
            return
        }
        if (a.issues.isEmpty()) {
            headerText.text = "✓ No issues found — ${a.wordCount} words · Score ${a.overallScore}/100 · Tone: ${a.tone}"
            headerText.setTextColor(Color.parseColor("#10b981"))
        } else {
            headerText.text = "${a.issues.size} issue${if (a.issues.size > 1) "s" else ""} found · Score ${a.overallScore}/100 · Tone: ${a.tone}"
        }
        body.addView(headerText)

        // Per-issue cards
        a.issues.forEachIndexed { idx, issue ->
            body.addView(buildIssueCard(issue, idx))
        }

        // Separator
        val sep = View(this).apply {
            setBackgroundColor(Color.parseColor("#e5e7eb"))
            setLayoutParams(LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 1).apply { topMargin = 24; bottomMargin = 16 })
        }
        body.addView(sep)

        // AI actions
        addAiActions(body, enabled = currentText.isNotEmpty())
    }

    private fun buildIssueCard(issue: LinguaAIApi.Issue, idx: Int): View {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 20, 24, 20)
            background = GradientDrawable().apply {
                cornerRadius = 16f
                setColor(Color.parseColor("#fafafa"))
                setStroke(1, Color.parseColor("#e5e7eb"))
            }
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.bottomMargin = 12
            layoutParams = lp
        }

        // Badge row
        val badgeRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val sevColor = when (issue.severity) {
            "critical" -> Color.parseColor("#fee2e2") to Color.parseColor("#b91c1c")
            "warning" -> Color.parseColor("#fef3c7") to Color.parseColor("#92400e")
            else -> Color.parseColor("#d1fae5") to Color.parseColor("#065f46")
        }
        val badge = TextView(this).apply {
            text = issue.type.uppercase()
            setTextColor(sevColor.second)
            textSize = 10f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            background = GradientDrawable().apply {
                cornerRadius = 8f
                setColor(sevColor.first)
            }
            setPadding(16, 4, 16, 4)
        }
        badgeRow.addView(badge)
        val sevLabel = TextView(this).apply {
            text = "  ${issue.severity}"
            setTextColor(Color.parseColor("#6b7280"))
            textSize = 10f
        }
        badgeRow.addView(sevLabel)
        card.addView(badgeRow)

        // Fix row: original → suggestion
        val fixRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 12, 0, 8)
        }
        val orig = TextView(this).apply {
            text = issue.original
            setTextColor(Color.parseColor("#ef4444"))
            paintFlags = paintFlags or android.graphics.Paint.STRIKE_THRU_TEXT_FLAG
            textSize = 14f
        }
        fixRow.addView(orig)
        val arrow = TextView(this).apply {
            text = "  →  "
            setTextColor(Color.parseColor("#9ca3af"))
            textSize = 14f
        }
        fixRow.addView(arrow)
        val sug = TextView(this).apply {
            text = issue.suggestion
            setTextColor(Color.parseColor("#10b981"))
            textSize = 14f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }
        fixRow.addView(sug)
        card.addView(fixRow)

        // Explanation
        val explain = TextView(this).apply {
            text = issue.explanation
            setTextColor(Color.parseColor("#6b7280"))
            textSize = 12f
            setPadding(0, 0, 0, 12)
        }
        card.addView(explain)

        // Actions row
        val actions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val replaceBtn = makeActionButton("Replace", Color.parseColor("#10b981"), Color.WHITE) {
            // Replace the original with the suggestion in the current text and broadcast back
            val newText = currentText.replaceFirst(issue.original, issue.suggestion, ignoreCase = false)
            currentText = newText
            currentAnalysis = currentAnalysis?.copy(
                issues = currentAnalysis!!.issues.filterIndexed { i, _ -> i != idx }
            )
            // Try to set the text in the active field via the accessibility service
            broadcastReplace(newText)
            toast("Replaced")
            renderPanel()
        }
        actions.addView(replaceBtn)
        val ignoreBtn = makeActionButton("Ignore", Color.parseColor("#f3f4f6"), Color.parseColor("#374151")) {
            currentAnalysis = currentAnalysis?.copy(
                issues = currentAnalysis!!.issues.filterIndexed { i, _ -> i != idx }
            )
            renderPanel()
        }
        val ignLp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        ignLp.leftMargin = 12
        ignoreBtn.layoutParams = ignLp
        actions.addView(ignoreBtn)
        card.addView(actions)

        return card
    }

    private fun addAiActions(body: LinearLayout, enabled: Boolean) {
        val label = TextView(this).apply {
            text = "AI ACTIONS"
            setTextColor(Color.parseColor("#6b7280"))
            textSize = 11f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(0, 8, 0, 12)
        }
        body.addView(label)

        val grid = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        val actions = listOf(
            "Improve" to "improve",
            "Rewrite" to "rewrite",
            "Shorten" to "shorten",
            "Expand" to "expand",
            "Simplify" to "simplify",
            "Make Professional" to "professional",
            "Make Casual" to "casual",
            "Make Confident" to "confident",
            "Make Friendly" to "friendly",
            "Make Concise" to "concise"
        )
        // 2-column grid
        val rows = actions.chunked(2)
        for ((rowIdx, row) in rows.withIndex()) {
            val rowLayout = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                weightSum = 2f
            }
            for ((colIdx, pair) in row.withIndex()) {
                val (lbl, action) = pair
                val btn = TextView(this).apply {
                    text = lbl
                    setTextColor(if (enabled) Color.parseColor("#065f46") else Color.parseColor("#9ca3af"))
                    textSize = 12f
                    typeface = android.graphics.Typeface.DEFAULT_BOLD
                    gravity = Gravity.CENTER
                    background = GradientDrawable().apply {
                        cornerRadius = 12f
                        setColor(if (enabled) Color.parseColor("#ecfdf5") else Color.parseColor("#f9fafb"))
                        setStroke(1, if (enabled) Color.parseColor("#a7f3d0") else Color.parseColor("#e5e7eb"))
                    }
                    setPadding(16, 20, 16, 20)
                    val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                    lp.bottomMargin = 8
                    if (colIdx == 0) lp.rightMargin = 8
                    layoutParams = lp
                    setOnClickListener {
                        if (enabled) doRewrite(action)
                    }
                }
                rowLayout.addView(btn)
            }
            grid.addView(rowLayout)
        }
        body.addView(grid)

        // Ask AI box
        val askLabel = TextView(this).apply {
            text = "ASK AI"
            setTextColor(Color.parseColor("#6b7280"))
            textSize = 11f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(0, 16, 0, 8)
        }
        body.addView(askLabel)

        val askRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = GradientDrawable().apply {
                cornerRadius = 12f
                setColor(Color.parseColor("#f9fafb"))
                setStroke(1, Color.parseColor("#e5e7eb"))
            }
            setPadding(20, 8, 8, 8)
        }
        val askInput = EditText(this).apply {
            hint = "e.g. Make this sound like a CEO wrote it"
            setHintTextColor(Color.parseColor("#9ca3af"))
            setTextColor(Color.parseColor("#1f2937"))
            textSize = 13f
            background = null
        }
        askRow.addView(askInput, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        val askBtn = TextView(this).apply {
            text = "→"
            setTextColor(Color.WHITE)
            textSize = 18f
            background = GradientDrawable().apply {
                cornerRadius = 24f
                setColor(if (enabled) Color.parseColor("#10b981") else Color.parseColor("#9ca3af"))
            }
            val sz = (32 * resources.displayMetrics.density).toInt()
            layoutParams = LinearLayout.LayoutParams(sz, sz).apply { leftMargin = 8 }
            gravity = Gravity.CENTER
            setOnClickListener {
                val instr = askInput.text.toString().trim()
                if (instr.isNotEmpty() && enabled) doRewrite("ai_command", instr)
            }
        }
        askRow.addView(askBtn)
        body.addView(askRow)

        // Translate row
        val trLabel = TextView(this).apply {
            text = "TRANSLATE"
            setTextColor(Color.parseColor("#6b7280"))
            textSize = 11f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(0, 16, 0, 8)
        }
        body.addView(trLabel)
        val langRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        val langs = listOf("Spanish", "French", "German", "Hindi", "Chinese", "Japanese")
        val hscroll = HorizontalScrollView(this)
        val langRowInner = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for (l in langs) {
            val b = TextView(this).apply {
                text = l
                setTextColor(if (enabled) Color.parseColor("#065f46") else Color.parseColor("#9ca3af"))
                textSize = 11f
                background = GradientDrawable().apply {
                    cornerRadius = 10f
                    setColor(if (enabled) Color.parseColor("#ecfdf5") else Color.parseColor("#f9fafb"))
                    setStroke(1, if (enabled) Color.parseColor("#a7f3d0") else Color.parseColor("#e5e7eb"))
                }
                setPadding(16, 10, 16, 10)
                val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                lp.rightMargin = 8
                layoutParams = lp
                setOnClickListener { if (enabled) doRewrite("translate", targetLang = l) }
            }
            langRowInner.addView(b)
        }
        hscroll.addView(langRowInner)
        body.addView(hscroll)

        // Quick stats footer
        currentAnalysis?.let { a ->
            val footer = TextView(this).apply {
                text = "·"
                setTextColor(Color.parseColor("#9ca3af"))
                textSize = 11f
                setPadding(0, 20, 0, 0)
                text = "Words: ${a.wordCount}  ·  Score: ${a.overallScore}/100  ·  Tone: ${a.tone}  ·  App: ${currentPackage.substringAfterLast('.')}"
            }
            body.addView(footer)
        }
    }

    private fun renderPanelError(msg: String) {
        val body = panel ?: return
        body.removeAllViews()
        val err = TextView(this).apply {
            text = "⚠ Analysis failed: $msg"
            setTextColor(Color.parseColor("#ef4444"))
            textSize = 12f
            setPadding(0, 12, 0, 12)
        }
        body.addView(err)
        addAiActions(body, enabled = currentText.isNotEmpty())
    }

    private fun makeActionButton(label: String, bg: Int, fg: Int, onClick: () -> Unit): TextView {
        return TextView(this).apply {
            text = label
            setTextColor(fg)
            textSize = 12f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            background = GradientDrawable().apply {
                cornerRadius = 10f
                setColor(bg)
            }
            setPadding(24, 12, 24, 12)
            setOnClickListener { onClick() }
        }
    }

    private fun doRewrite(action: String, instruction: String? = null, targetLang: String? = null) {
        if (currentText.isBlank()) return
        toast("Working on it...")
        val goal = AppSettings.getPerApp(this, currentPackage).let {
            if (it.goal != "general") it.goal else AppSettings.defaultGoalFor(currentPackage)
        }
        api.rewrite(currentText, action, instruction, targetLang, goal, object : LinguaAIApi.Callback<LinguaAIApi.RewriteResult> {
            override fun onSuccess(result: LinguaAIApi.RewriteResult) {
                showRewriteResult(result.result)
            }
            override fun onError(message: String) {
                toast("Rewrite failed: $message")
            }
        })
    }

    private fun showRewriteResult(result: String) {
        val body = panel ?: return
        body.removeAllViews()
        val title = TextView(this).apply {
            text = "AI Result"
            setTextColor(Color.parseColor("#064e3b"))
            textSize = 14f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(0, 0, 0, 12)
        }
        body.addView(title)
        val res = TextView(this).apply {
            text = result
            setTextColor(Color.parseColor("#1f2937"))
            textSize = 13f
            setLineSpacing(4f, 1f)
            setPadding(20, 20, 20, 20)
            background = GradientDrawable().apply {
                cornerRadius = 12f
                setColor(Color.parseColor("#ecfdf5"))
                setStroke(1, Color.parseColor("#a7f3d0"))
            }
        }
        body.addView(res)

        val actions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 16, 0, 0)
        }
        val replaceBtn = makeActionButton("Replace in app", Color.parseColor("#10b981"), Color.WHITE) {
            currentText = result
            broadcastReplace(result)
            toast("Replaced in original field")
            hidePanel()
        }
        actions.addView(replaceBtn)
        val copyBtn = makeActionButton("Copy", Color.parseColor("#f3f4f6"), Color.parseColor("#374151")) {
            val cm = getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager
            cm.setPrimaryClip(android.content.ClipData.newPlainText("LinguaAI", result))
            toast("Copied")
        }
        val cpLp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        cpLp.leftMargin = 12
        copyBtn.layoutParams = cpLp
        actions.addView(copyBtn)
        val backBtn = makeActionButton("Back", Color.parseColor("#f3f4f6"), Color.parseColor("#374151")) {
            renderPanel()
        }
        val bkLp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        bkLp.leftMargin = 12
        backBtn.layoutParams = bkLp
        actions.addView(backBtn)
        body.addView(actions)
    }

    private fun broadcastReplace(newText: String) {
        val intent = Intent("com.linguaai.app.REPLACE_TEXT").apply {
            setPackage(packageName)
            putExtra("text", newText)
        }
        sendBroadcast(intent)
    }

    private fun toast(msg: String) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
    }

    // ---------- Foreground notification ----------

    private fun buildNotification(): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(CHANNEL_ID, getString(R.string.floating_notification_channel), NotificationManager.IMPORTANCE_LOW).apply {
                description = getString(R.string.floating_notification_text)
                setShowBadge(false)
            }
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(ch)
        }
        val notifIntent = Intent(this, MainActivity::class.java)
        val pi = android.app.PendingIntent.getActivity(
            this, 0, notifIntent,
            android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT
        )
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
                .setContentTitle(getString(R.string.app_name))
                .setContentText(getString(R.string.floating_notification_text))
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(pi)
                .setOngoing(true)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
                .setContentTitle(getString(R.string.app_name))
                .setContentText(getString(R.string.floating_notification_text))
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(pi)
                .setOngoing(true)
                .build()
        }
    }

    companion object {
        private const val TAG = "LinguaAI-Floating"
        private const val NOTIF_ID = 4242
        private const val CHANNEL_ID = "linguaai_floating"
    }
}
