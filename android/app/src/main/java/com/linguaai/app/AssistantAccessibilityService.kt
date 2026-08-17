package com.linguaai.app

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.util.concurrent.Executors

class AssistantAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "LinguAAI_A11y"
        private const val DEBOUNCE_MS = 1500L
        private const val MIN_TEXT_LENGTH = 3
        private const val MAX_TEXT_LENGTH = 5000
    }

    private val handler = Handler(Looper.getMainLooper())

    private var analyzeRunnable: Runnable? = null
    private var currentTextNode: AccessibilityNodeInfo? = null
    private var currentText: String = ""
    private var lastAnalysis: LinguaAIApi.Analysis? = null
    private var bubbleManager: FloatingBubbleManager? = null

    private var isApplyingFix = false

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.d(TAG, "Accessibility service connected")

        val info = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_VIEW_FOCUSED or
                    AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED or
                    AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            notificationTimeout = 100
        }
        serviceInfo = info

        bubbleManager = FloatingBubbleManager(this, ::onBubbleTapped, ::onAcceptIssue, ::onAcceptAll, ::onDismissPanel)
        Log.d(TAG, "Floating bubble manager initialized")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (isApplyingFix) return

        when (event.eventType) {
            AccessibilityEvent.TYPE_VIEW_FOCUSED,
            AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED,
            AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED -> {
                handleTextEvent(event)
            }
        }
    }

    private fun handleTextEvent(event: AccessibilityEvent) {
        val source = event.source ?: return

        val className = source.className?.toString() ?: ""
        val isEditable = className.contains("EditText", true) ||
                className.contains("AutoCompleteTextView", true) ||
                className.contains("MultiAutoCompleteTextView", true) ||
                source.isEditable

        if (!isEditable) return

        try {
            val inputType = source.inputType
            val variation = inputType and InputType.TYPE_MASK_VARIATION
            if (variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
                variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
                variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD) {
                hideBubble()
                return
            }
        } catch (_: Exception) {}

        val text = source.text?.toString() ?: ""
        if (text.length < MIN_TEXT_LENGTH) {
            hideBubble()
            return
        }
        if (text.length > MAX_TEXT_LENGTH) return

        currentTextNode = source
        currentText = text

        analyzeRunnable?.let { handler.removeCallbacks(it) }
        val r = Runnable {
            if (currentText.trim().length >= MIN_TEXT_LENGTH) {
                analyzeText(currentText)
            }
        }
        analyzeRunnable = r
        handler.postDelayed(r, DEBOUNCE_MS)
    }

    private fun analyzeText(text: String) {
        Log.d(TAG, "Analyzing text: ${text.take(50)}...")
        bubbleManager?.showAnalyzing()

        val api = LinguaAIApi(this)
        api.analyze(text, "general", object : LinguaAIApi.Callback<LinguaAIApi.Analysis> {
            override fun onSuccess(result: LinguaAIApi.Analysis) {
                lastAnalysis = result
                if (result.issues.isNotEmpty()) {
                    bubbleManager?.showSuggestionCount(result.issues.size, result.overallScore)
                } else {
                    bubbleManager?.showAllClear()
                }
            }

            override fun onError(message: String) {
                Log.d(TAG, "Analysis error: $message")
                bubbleManager?.hideBubble()
            }
        })
    }

    private fun onBubbleTapped() {
        val analysis = lastAnalysis ?: return
        if (analysis.issues.isEmpty()) {
            bubbleManager?.hideBubble()
            return
        }
        bubbleManager?.showSuggestionPanel(analysis.issues, analysis.overallScore, analysis.tone)
    }

    private fun onAcceptIssue(issue: LinguaAIApi.Issue) {
        val node = currentTextNode ?: return
        val newText = currentText.replaceFirst(issue.original, issue.suggestion, ignoreCase = false)
        if (newText != currentText) {
            isApplyingFix = true
            val args = Bundle()
            args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, newText)
            node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            currentText = newText
            isApplyingFix = false

            handler.postDelayed({
                if (currentText.trim().length >= MIN_TEXT_LENGTH) {
                    analyzeText(currentText)
                }
            }, 500)
        }
    }

    private fun onAcceptAll() {
        val analysis = lastAnalysis ?: return
        val node = currentTextNode ?: return
        var newText = currentText
        for (issue in analysis.issues) {
            newText = newText.replaceFirst(issue.original, issue.suggestion, ignoreCase = false)
        }
        if (newText != currentText) {
            isApplyingFix = true
            val args = Bundle()
            args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, newText)
            node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            currentText = newText
            isApplyingFix = false
            bubbleManager?.hideBubble()
        }
    }

    private fun onDismissPanel() {
        bubbleManager?.collapsePanel()
    }

    private fun hideBubble() {
        bubbleManager?.hideBubble()
    }

    override fun onInterrupt() {
        Log.d(TAG, "Accessibility service interrupted")
    }

    override fun onDestroy() {
        super.onDestroy()
        bubbleManager?.destroy()
        analyzeRunnable?.let { handler.removeCallbacks(it) }
        Log.d(TAG, "Accessibility service destroyed")
    }
}
