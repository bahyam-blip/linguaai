package com.linguaai.app

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat

/**
 * LinguaAIAccessibilityService
 *
 * Watches for text-changed and view-focused events on editable fields across all apps.
 * When the user is typing in an EditText (or contenteditable in a WebView), it captures:
 *   - the current text of the field
 *   - the package name of the app (for per-app settings)
 *   - the cursor position (when available)
 *
 * It then signals LinguaAIFloatingService to show/hide the floating button near the field.
 *
 * PRIVACY: text is held in-memory only long enough to be analyzed. It is not logged,
 * not written to disk, and is sent only to the user-configured LinguaAI API endpoint.
 */
class LinguaAIAccessibilityService : AccessibilityService() {

    private var lastText: String = ""
    private var lastPackage: String = ""
    private var lastEventTime: Long = 0
    private var lastSignalTime: Long = 0

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        if (!AppSettings.isEnabled(this)) return

        val pkg = event.packageName?.toString() ?: return
        // Ignore our own app
        if (pkg == packageName) return

        val perApp = AppSettings.getPerApp(this, pkg)
        if (!perApp.enabled) {
            // Hide the floating button if this app is disabled
            signalFloating(FloatingSignal.Hide, pkg, "")
            return
        }
        if (!perApp.floatingButton) {
            signalFloating(FloatingSignal.Hide, pkg, "")
            return
        }

        when (event.eventType) {
            AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED,
            AccessibilityEvent.TYPE_VIEW_FOCUSED -> {
                handleEditableEvent(event, pkg, perApp)
            }
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                // Window changed — refresh floating button visibility but don't analyze
                if (System.currentTimeMillis() - lastSignalTime > 800) {
                    val editable = findCurrentEditableText(event.source ?: rootInActiveWindow)
                    if (editable != null) {
                        signalFloating(FloatingSignal.Show, pkg, editable)
                    } else if (lastPackage != pkg) {
                        // New app window with no editable in focus — hide
                        signalFloating(FloatingSignal.Hide, pkg, "")
                    }
                }
            }
        }
    }

    private fun handleEditableEvent(event: AccessibilityEvent, pkg: String, perApp: AppSettings.PerAppConfig) {
        val src = event.source ?: return
        val text = findCurrentEditableText(src) ?: return
        // Only consider real text (length > 0) or focus on an editable
        if (text.isEmpty() && event.eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) return

        val now = System.currentTimeMillis()
        // Throttle: at most one event per 500ms per same text
        if (text == lastText && now - lastEventTime < 1500) return
        if (text.isEmpty()) return
        lastText = text
        lastPackage = pkg
        lastEventTime = now

        // Notify the floating service: show button, and (if auto-analyze) trigger analysis
        if (perApp.autoSuggest && AppSettings.isAutoAnalyze(this)) {
            signalFloating(FloatingSignal.Analyze, pkg, text)
        } else {
            signalFloating(FloatingSignal.Show, pkg, text)
        }
    }

    /**
     * Walk the accessibility tree to find the focused editable's text.
     * Returns the text of the currently focused editable node, or null if none.
     */
    private fun findCurrentEditableText(root: AccessibilityNodeInfo?): String? {
        root ?: return null
        try {
            // First try the focused node
            val focused = root.findFocus(AccessibilityNodeInfoCompat.FOCUS_INPUT)
            if (focused != null && focused.isEditable) {
                return extractText(focused)
            }
            // Otherwise walk the tree looking for editables
            val stack = ArrayDeque<AccessibilityNodeInfo>()
            stack.addLast(root)
            var bestText: String? = null
            while (stack.isNotEmpty()) {
                val node = stack.removeLast()
                if (node.isEditable) {
                    val t = extractText(node)
                    if (!t.isNullOrEmpty()) {
                        // Prefer focused, otherwise take the first one we find
                        if (node.isFocused) return t
                        if (bestText.isNullOrEmpty()) bestText = t
                    }
                }
                for (i in 0 until node.childCount) {
                    node.getChild(i)?.let { stack.addLast(it) }
                }
            }
            return bestText
        } catch (e: Exception) {
            Log.w(TAG, "findCurrentEditableText failed", e)
            return null
        } finally {
            // Don't recycle the root — caller may still use it
        }
    }

    private fun extractText(node: AccessibilityNodeInfo): String? {
        // Try text first
        node.text?.toString()?.takeIf { it.isNotEmpty() }?.let { return it }
        // Fall back to contentDescription
        return node.contentDescription?.toString()
    }

    private fun signalFloating(signal: FloatingSignal, pkg: String, text: String) {
        lastSignalTime = System.currentTimeMillis()
        val intent = Intent("com.linguaai.app.FLOATING_SIGNAL").apply {
            setPackage(packageName)
            putExtra("signal", signal.name)
            putExtra("package", pkg)
            putExtra("text", text)
        }
        android.util.Log.d(TAG, "Signal: $signal pkg=$pkg textLen=${text.length}")
        sendBroadcast(intent)
    }

    override fun onInterrupt() {
        Log.d(TAG, "Accessibility service interrupted")
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.d(TAG, "LinguaAIAccessibilityService connected")
    }

    companion object {
        private const val TAG = "LinguaAI-A11y"

        /**
         * Check whether the LinguaAI accessibility service is enabled in system settings.
         */
        fun isEnabled(ctx: android.content.Context): Boolean {
            val enabled = android.provider.Settings.Secure.getString(
                ctx.contentResolver,
                android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            ) ?: return false
            val cn = ComponentName(ctx, LinguaAIAccessibilityService::class.java).flattenToString()
            return enabled.split(":").any { it.equals(cn, ignoreCase = true) || it.equals(cn.replace(ctx.packageName, "com.linguaai.app"), ignoreCase = true) }
        }
    }
}

enum class FloatingSignal { Show, Hide, Analyze }
