package com.linguaai.app

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Manages the floating overlay bubble and suggestion panel.
 *
 * Uses TYPE_ACCESSIBILITY_OVERLAY so no SYSTEM_ALERT_WINDOW permission is needed.
 * The bubble floats over any app, shows a suggestion count badge, and expands
 * into a full suggestion panel when tapped.
 */
class FloatingBubbleManager(
    private val context: Context,
    private val onBubbleTapped: () -> Unit,
    private val onAcceptIssue: (LinguaAIApi.Issue) -> Unit,
    private val onAcceptAll: () -> Unit,
    private val onDismiss: () -> Unit
) {
    companion object {
        private const val TAG = "BubbleManager"
        private const val BUBBLE_SIZE = 130
        private const val PANEL_WIDTH = 900
    }

    private val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val handler = Handler(Looper.getMainLooper())

    private var bubbleView: View? = null
    private var panelView: View? = null
    private var bubbleIcon: TextView? = null
    private var badgeText: TextView? = null

    private val colEmerald = Color.parseColor("#10b981")
    private val colEmeraldDark = Color.parseColor("#059669")
    private val colEmeraldLight = Color.parseColor("#d1fae5")
    private val colEmeraldBg = Color.parseColor("#ecfdf5")
    private val colWhite = Color.WHITE
    private val colBg = Color.parseColor("#ffffff")
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

    private var bubbleX = 0
    private var bubbleY = 200
    private var isPanelVisible = false

    fun showAnalyzing() {
        handler.post {
            ensureBubble()
            bubbleIcon?.text = "✓"
            bubbleIcon?.setTextColor(colWhite)
            (bubbleView?.background as? GradientDrawable)?.setColor(colEmeraldDark)
            badgeText?.visibility = View.GONE
            bubbleView?.visibility = View.VISIBLE
            handler.postDelayed({
                if (bubbleView?.visibility == View.VISIBLE && badgeText?.visibility == View.GONE) {
                    (bubbleView?.background as? GradientDrawable)?.setColor(colAmber)
                    bubbleIcon?.text = "•••"
                    bubbleIcon?.textSize = 9f
                }
            }, 600)
        }
    }

    fun showSuggestionCount(count: Int, score: Int) {
        handler.post {
            ensureBubble()
            (bubbleView?.background as? GradientDrawable)?.setColor(colEmerald)
            bubbleIcon?.text = "Aa"
            bubbleIcon?.textSize = 16f
            bubbleIcon?.setTextColor(colWhite)
            badgeText?.text = count.toString()
            badgeText?.visibility = if (count > 0) View.VISIBLE else View.GONE
            bubbleView?.visibility = View.VISIBLE
        }
    }

    fun showAllClear() {
        handler.post {
            ensureBubble()
            (bubbleView?.background as? GradientDrawable)?.setColor(colEmerald)
            bubbleIcon?.text = "✓"
            bubbleIcon?.textSize = 18f
            bubbleIcon?.setTextColor(colWhite)
            badgeText?.visibility = View.GONE
            bubbleView?.visibility = View.VISIBLE
            handler.postDelayed({
                if (badgeText?.visibility == View.GONE) {
                    bubbleView?.visibility = View.GONE
                }
            }, 2000)
        }
    }

    fun hideBubble() {
        handler.post {
            bubbleView?.visibility = View.GONE
            collapsePanel()
        }
    }

    fun showSuggestionPanel(issues: List<LinguaAIApi.Issue>, score: Int, tone: String) {
        handler.post {
            collapsePanel()
            val panel = buildPanelView(issues, score, tone)
            val params = WindowManager.LayoutParams().apply {
                type = WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
                format = PixelFormat.TRANSLUCENT
                flags = WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                width = WindowManager.LayoutParams.WRAP_CONTENT
                height = WindowManager.LayoutParams.WRAP_CONTENT
                gravity = Gravity.CENTER
            }
            try {
                windowManager.addView(panel, params)
                panelView = panel
                isPanelVisible = true
            } catch (e: Exception) {
                Log.e(TAG, "Failed to show panel", e)
            }
        }
    }

    fun collapsePanel() {
        panelView?.let {
            try { windowManager.removeView(it) } catch (_: Exception) {}
        }
        panelView = null
        isPanelVisible = false
    }

    fun destroy() {
        handler.post {
            collapsePanel()
            bubbleView?.let {
                try { windowManager.removeView(it) } catch (_: Exception) {}
            }
            bubbleView = null
        }
    }

    private fun ensureBubble() {
        if (bubbleView != null) return

        val view = FrameLayout(context)
        val params = WindowManager.LayoutParams().apply {
            type = WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
            format = PixelFormat.TRANSLUCENT
            flags = WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
            width = BUBBLE_SIZE
            height = BUBBLE_SIZE
            gravity = Gravity.TOP or Gravity.START
            x = bubbleX
            y = bubbleY
        }

        val bgDrawable = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(colEmerald)
        }
        view.background = bgDrawable
        view.elevation = 24f

        val icon = TextView(context).apply {
            text = "Aa"
            setTextColor(colWhite)
            textSize = 16f
            gravity = Gravity.CENTER
        }
        val iconLp = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        )
        iconLp.gravity = Gravity.CENTER
        view.addView(icon, iconLp)
        bubbleIcon = icon

        val badge = TextView(context).apply {
            text = "0"
            setTextColor(colWhite)
            textSize = 11f
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(colError)
            }
            visibility = View.GONE
            setPadding(4, 2, 4, 2)
        }
        val badgeLp = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        )
        badgeLp.gravity = Gravity.TOP or Gravity.END
        view.addView(badge, badgeLp)
        badgeText = badge

        var initialX = 0
        var initialY = 0
        var touchX = 0f
        var touchY = 0f
        var isDragging = false

        view.setOnTouchListener { v, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    touchX = event.rawX
                    touchY = event.rawY
                    isDragging = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - touchX
                    val dy = event.rawY - touchY
                    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                        isDragging = true
                        params.x = initialX + dx.toInt()
                        params.y = initialY + dy.toInt()
                        try { windowManager.updateViewLayout(view, params) } catch (_: Exception) {}
                        bubbleX = params.x
                        bubbleY = params.y
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!isDragging) {
                        if (isPanelVisible) {
                            collapsePanel()
                        } else {
                            onBubbleTapped()
                        }
                    }
                    true
                }
                else -> false
            }
        }

        try {
            windowManager.addView(view, params)
            bubbleView = view
        } catch (e: Exception) {
            Log.e(TAG, "Failed to add bubble overlay", e)
        }
    }

    private fun dp(v: Int): Int = (v * context.resources.displayMetrics.density).toInt()

    private fun buildPanelView(issues: List<LinguaAIApi.Issue>, score: Int, tone: String): View {
        val density = context.resources.displayMetrics.density

        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(colBg)
            background = GradientDrawable().apply {
                cornerRadius = 24f * density
                setColor(colBg)
                setStroke(dp(1), colBorder)
            }
            elevation = 32f
        }

        val rootLp = FrameLayout.LayoutParams(dp(PANEL_WIDTH), FrameLayout.LayoutParams.WRAP_CONTENT)
        rootLp.gravity = Gravity.CENTER
        root.layoutParams = rootLp

        // Header
        val header = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(20), dp(16), dp(20), dp(16))
            gravity = Gravity.CENTER_VERTICAL
            background = GradientDrawable().apply {
                colors = intArrayOf(colEmerald, colEmeraldDark)
                orientation = GradientDrawable.Orientation.LEFT_RIGHT
            }
        }

        val logoBox = LinearLayout(context).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(colWhite)
            }
            val lp = LinearLayout.LayoutParams(dp(40), dp(40))
            lp.rightMargin = dp(12)
            layoutParams = lp
        }
        logoBox.addView(TextView(context).apply {
            text = "Aa"
            setTextColor(colEmerald)
            textSize = 16f
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.MATCH_PARENT)
        })
        header.addView(logoBox)

        val titleBox = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        titleBox.addView(TextView(context).apply {
            text = "LinguaAI"
            setTextColor(colWhite)
            textSize = 17f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        })
        titleBox.addView(TextView(context).apply {
            text = "${issues.size} issue${if (issues.size > 1) "s" else ""} found  ·  Score: $score"
            setTextColor(colEmeraldLight)
            textSize = 11f
        })
        header.addView(titleBox)

        val closeBtn = TextView(context).apply {
            text = "✕"
            setTextColor(colWhite)
            textSize = 18f
            setPadding(dp(12), dp(4), dp(4), dp(12))
            setOnClickListener { onDismiss() }
        }
        val closeLp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        closeLp.gravity = Gravity.CENTER_VERTICAL
        header.addView(closeBtn, closeLp)
        root.addView(header)

        // Issues list
        val scroll = ScrollView(context)
        val listContainer = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(12), dp(16), dp(12))
        }

        if (issues.isNotEmpty()) {
            val acceptAllBtn = TextView(context).apply {
                text = "Accept all fixes"
                setTextColor(colWhite)
                textSize = 13f
                gravity = Gravity.CENTER
                background = GradientDrawable().apply {
                    cornerRadius = 12f * density
                    setColor(colEmerald)
                }
                setPadding(dp(14), dp(10), dp(14), dp(10))
                setOnClickListener { onAcceptAll() }
            }
            val acceptAllLp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            acceptAllLp.bottomMargin = dp(12)
            listContainer.addView(acceptAllBtn, acceptAllLp)
        }

        for (issue in issues) {
            listContainer.addView(buildIssueCard(issue, density))
        }

        if (tone.isNotBlank()) {
            val toneCard = LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(14), dp(12), dp(14), dp(12))
                background = GradientDrawable().apply {
                    cornerRadius = 14f * density
                    setColor(colEmeraldBg)
                    setStroke(dp(1), colEmeraldLight)
                }
                val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                lp.topMargin = dp(8)
                layoutParams = lp
            }
            toneCard.addView(TextView(context).apply {
                text = "Tone"
                setTextColor(colEmeraldDark)
                textSize = 11f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
            })
            toneCard.addView(TextView(context).apply {
                text = tone
                setTextColor(colTextPrimary)
                textSize = 13f
            })
            listContainer.addView(toneCard)
        }

        scroll.addView(listContainer)
        root.addView(scroll)
        return root
    }

    private fun buildIssueCard(issue: LinguaAIApi.Issue, density: Float): View {
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

        val card = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = GradientDrawable().apply {
                cornerRadius = 14f * density
                setColor(colBg)
                setStroke(dp(1), colBorder)
            }
            elevation = 2f
        }
        val cardLp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        cardLp.bottomMargin = dp(8)
        card.layoutParams = cardLp

        val badgeRow = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val badge = TextView(context).apply {
            text = "  ${issue.type.uppercase()}  "
            setTextColor(sevColor)
            textSize = 9f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            background = GradientDrawable().apply {
                cornerRadius = 6f * density
                setColor(sevBg)
            }
            setPadding(dp(2), dp(2), dp(2), dp(2))
        }
        badgeRow.addView(badge)
        val sevLabel = TextView(context).apply {
            text = "  ${issue.severity}"
            setTextColor(colTextTertiary)
            textSize = 9f
        }
        badgeRow.addView(sevLabel)
        card.addView(badgeRow)

        val fix = TextView(context).apply {
            text = "${issue.original}  →  ${issue.suggestion}"
            setTextColor(colTextPrimary)
            textSize = 14f
            setLineSpacing(2f, 1f)
            setPadding(0, dp(8), 0, dp(4))
        }
        card.addView(fix)

        if (issue.explanation.isNotBlank()) {
            val explain = TextView(context).apply {
                text = issue.explanation
                setTextColor(colTextSecondary)
                textSize = 12f
                setLineSpacing(1f, 1f)
                setPadding(0, 0, 0, dp(8))
            }
            card.addView(explain)
        }

        val btnRow = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        val replaceBtn = TextView(context).apply {
            text = "Accept"
            setTextColor(colWhite)
            textSize = 12f
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                cornerRadius = 10f * density
                setColor(colEmerald)
            }
            setPadding(dp(14), dp(8), dp(14), dp(8))
            setOnClickListener { onAcceptIssue(issue) }
        }
        val replaceLp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        replaceLp.rightMargin = dp(8)
        btnRow.addView(replaceBtn, replaceLp)

        val copyBtn = TextView(context).apply {
            text = "Copy fix"
            setTextColor(colTextSecondary)
            textSize = 12f
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                cornerRadius = 10f * density
                setColor(colDivider)
            }
            setPadding(dp(14), dp(8), dp(14), dp(8))
            setOnClickListener {
                val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                cm.setPrimaryClip(android.content.ClipData.newPlainText("LinguaAI", issue.suggestion))
            }
        }
        btnRow.addView(copyBtn)
        card.addView(btnRow)

        return card
    }
}
