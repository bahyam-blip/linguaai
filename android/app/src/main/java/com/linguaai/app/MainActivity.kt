package com.linguaai.app

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.method.ScrollingMovementMethod
import android.view.View
import android.widget.*
import androidx.activity.ComponentActivity

/**
 * Main launcher activity.
 *
 * Shows onboarding + status of:
 *   - SYSTEM_ALERT_WINDOW permission (for floating overlay)
 *   - Accessibility service (for reading text in other apps)
 *
 * Once both are granted, the floating service runs in the background and the user
 * can switch to WhatsApp / Gmail / etc to see the assistant in action.
 *
 * Also exposes:
 *   - Toggle floating assistant on/off
 *   - Hide floating button temporarily
 *   - Open per-app settings (basic)
 *   - Change API endpoint
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val density = resources.displayMetrics.density
        val pad = (24 * density).toInt()

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad + statusBarHeight(), pad, pad)
            setBackgroundColor(0xFFfafafa.toInt())
        }

        // Header
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, pad)
        }
        val logo = TextView(this).apply {
            text = "Aa"
            setTextColor(android.graphics.Color.WHITE)
            textSize = 22f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = android.view.Gravity.CENTER
            background = GradientDrawableHelper.oval(intArrayOf(0xFF10b981.toInt(), 0xFF0d9488.toInt()))
        }
        val logoSize = (48 * density).toInt()
        header.addView(logo, LinearLayout.LayoutParams(logoSize, logoSize).apply { rightMargin = pad })
        val titleBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        titleBox.addView(TextView(this).apply {
            text = "LinguaAI"
            textSize = 20f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(0xFF064e3b.toInt())
        })
        titleBox.addView(TextView(this).apply {
            text = "Floating AI Writing Assistant"
            textSize = 12f
            setTextColor(0xFF6b7280.toInt())
        })
        header.addView(titleBox)
        root.addView(header)

        // Status cards
        val overlayCard = StatusCard(this, "Overlay permission", "Required to show the floating button over other apps.") {
            if (!Settings.canDrawOverlays(this)) {
                val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))
                startActivity(intent)
            } else {
                Toast.makeText(this, "Already granted", Toast.LENGTH_SHORT).show()
            }
        }
        root.addView(overlayCard)

        val a11yCard = StatusCard(this, "Accessibility service", "Required to detect text you are typing in other apps (WhatsApp, Gmail, etc.).") {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }
        root.addView(a11yCard)

        // Enable / disable floating
        val enableToggle = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            setPadding(pad, pad, pad, pad)
            background = GradientDrawableHelper.rounded(intArrayOf(0xFFFFFFFF.toInt(), 0xFFFFFFFF.toInt()), 16f, 0xFFe5e7eb.toInt())
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
            lp.bottomMargin = pad
            layoutParams = lp
        }
        val toggleLabel = TextView(this).apply {
            text = "Floating assistant enabled"
            textSize = 14f
            setTextColor(0xFF1f2937.toInt())
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        enableToggle.addView(toggleLabel)
        val switch = Switch(this).apply {
            isChecked = AppSettings.isEnabled(this@MainActivity)
            setOnCheckedChangeListener { _, v -> AppSettings.setEnabled(this@MainActivity, v) }
        }
        enableToggle.addView(switch)
        root.addView(enableToggle)

        // Hide floating button temporarily
        val hideBtn = Button(this).apply {
            text = if (AppSettings.isFloatingHidden(this@MainActivity)) "Show floating button" else "Hide floating button temporarily"
            setOnClickListener {
                val newVal = !AppSettings.isFloatingHidden(this@MainActivity)
                AppSettings.setFloatingHidden(this@MainActivity, newVal)
                this.text = if (newVal) "Show floating button" else "Hide floating button temporarily"
                Toast.makeText(this@MainActivity, if (newVal) "Floating button hidden" else "Floating button visible", Toast.LENGTH_SHORT).show()
            }
        }
        root.addView(hideBtn)

        // Start service button
        val startBtn = Button(this).apply {
            text = "Start / restart floating service"
            setOnClickListener {
                val intent = Intent(this@MainActivity, LinguaAIFloatingService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(intent)
                } else {
                    startService(intent)
                }
                Toast.makeText(this@MainActivity, "LinguaAI is running. Switch to WhatsApp or Gmail to see it in action.", Toast.LENGTH_LONG).show()
            }
        }
        root.addView(startBtn)

        // Status text
        val statusText = TextView(this).apply {
            text = "Status: ${if (Settings.canDrawOverlays(this@MainActivity)) "overlay ✓" else "overlay ✗"} · ${if (LinguaAIAccessibilityService.isEnabled(this@MainActivity)) "accessibility ✓" else "accessibility ✗"}"
            textSize = 12f
            setTextColor(0xFF6b7280.toInt())
            setPadding(0, pad, 0, pad)
            movementMethod = ScrollingMovementMethod.getInstance()
        }
        root.addView(statusText)

        // Instructions
        val instr = TextView(this).apply {
            text = """
HOW IT WORKS

1. Grant overlay + accessibility permissions above.
2. Tap "Start floating service".
3. Open WhatsApp / Gmail / Messages / any app with a text field.
4. Start typing — a small green bubble will appear.
5. Tap the bubble to see issues + AI actions.
6. Use Replace to put the corrected text back into the app.

PRIVACY

Text is read on-demand from the focused field and sent only to the LinguaAI API for analysis. Nothing is stored on-device beyond your settings.

DEFAULTS BY APP

WhatsApp → Casual / Social
Gmail → Professional / Email
LinkedIn → Professional
Slack/Teams → Professional / Business
Google Docs → Professional / Academic
            """.trimIndent()
            textSize = 12f
            setTextColor(0xFF374151.toInt())
            setLineSpacing(4f, 1f)
            setPadding(0, pad, 0, pad)
        }
        root.addView(instr)

        // Endpoint config
        val endpointLabel = TextView(this).apply {
            text = "API endpoint"
            textSize = 11f
            setTextColor(0xFF6b7280.toInt())
        }
        root.addView(endpointLabel)
        val endpointInput = EditText(this).apply {
            setText(AppSettings.getEndpoint(this@MainActivity))
            hint = "https://your-domain.com/api/grammar"
            textSize = 12f
        }
        root.addView(endpointInput)
        val saveBtn = Button(this).apply {
            text = "Save endpoint"
            setOnClickListener {
                AppSettings.setEndpoint(this@MainActivity, endpointInput.text.toString().trim())
                Toast.makeText(this@MainActivity, "Saved", Toast.LENGTH_SHORT).show()
            }
        }
        root.addView(saveBtn)

        setContentView(root)
    }

    override fun onResume() {
        super.onResume()
        // Refresh status — easiest way is to recreate the activity
        recreate()
    }

    private fun statusBarHeight(): Int {
        val res = resources.getIdentifier("status_bar_height", "dimen", "android")
        return if (res > 0) resources.getDimensionPixelSize(res) else 0
    }
}

/** Helper to create gradient drawables without XML boilerplate. */
object GradientDrawableHelper {
    fun oval(colors: IntArray): android.graphics.drawable.GradientDrawable {
        return android.graphics.drawable.GradientDrawable().apply {
            shape = android.graphics.drawable.GradientDrawable.OVAL
            this.colors = colors
            orientation = android.graphics.drawable.GradientDrawable.Orientation.TOP_BOTTOM
        }
    }
    fun rounded(colors: IntArray, radius: Float, stroke: Int): android.graphics.drawable.GradientDrawable {
        return android.graphics.drawable.GradientDrawable().apply {
            cornerRadius = radius
            this.colors = colors
            orientation = android.graphics.drawable.GradientDrawable.Orientation.LEFT_RIGHT
            if (stroke != 0) setStroke(1, stroke)
        }
    }
}

/** A simple card showing permission status with a button to fix it. */
class StatusCard(ctx: Context, title: String, desc: String, val onClick: () -> Unit) : LinearLayout(ctx) {
    init {
        orientation = VERTICAL
        val pad = (16 * ctx.resources.displayMetrics.density).toInt()
        setPadding(pad, pad, pad, pad)
        background = GradientDrawableHelper.rounded(intArrayOf(0xFFFFFFFF.toInt(), 0xFFFFFFFF.toInt()), 16f, 0xFFe5e7eb.toInt())
        val lp = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
        lp.bottomMargin = pad
        layoutParams = lp

        addView(TextView(ctx).apply {
            text = title
            textSize = 14f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setTextColor(0xFF1f2937.toInt())
        })
        addView(TextView(ctx).apply {
            text = desc
            textSize = 11f
            setTextColor(0xFF6b7280.toInt())
            setPadding(0, 4, 0, 12)
        })
        addView(Button(ctx).apply {
            text = "Open settings"
            setOnClickListener { onClick() }
        })
    }
}
