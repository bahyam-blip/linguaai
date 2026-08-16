package com.linguaai.app

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * Per-app and global settings for LinguaAI.
 * Stores: enabled apps, per-app tone, floating button position, sizes, etc.
 */
object AppSettings {
    private const val PREFS = "linguaai_settings"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_FLOATING_X = "floating_x"
    private const val KEY_FLOATING_Y = "floating_y"
    private const val KEY_FLOATING_HIDDEN = "floating_hidden"
    private const val KEY_AUTO_ANALYZE = "auto_analyze"
    private const val KEY_BUTTON_SIZE = "button_size"
    private const val KEY_ENDPOINT = "endpoint"
    private const val KEY_PER_APP_PREFIX = "per_app_"
    private const val KEY_GLOBAL_TONE = "global_tone"
    private const val KEY_GLOBAL_GOAL = "global_goal"

    const val DEFAULT_ENDPOINT = "https://preview-linguaai.space-z.ai/api/grammar"

    private fun prefs(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isEnabled(ctx: Context): Boolean = prefs(ctx).getBoolean(KEY_ENABLED, true)
    fun setEnabled(ctx: Context, v: Boolean) = prefs(ctx).edit().putBoolean(KEY_ENABLED, v).apply()

    fun isFloatingHidden(ctx: Context): Boolean = prefs(ctx).getBoolean(KEY_FLOATING_HIDDEN, false)
    fun setFloatingHidden(ctx: Context, v: Boolean) = prefs(ctx).edit().putBoolean(KEY_FLOATING_HIDDEN, v).apply()

    fun isAutoAnalyze(ctx: Context): Boolean = prefs(ctx).getBoolean(KEY_AUTO_ANALYZE, true)
    fun setAutoAnalyze(ctx: Context, v: Boolean) = prefs(ctx).edit().putBoolean(KEY_AUTO_ANALYZE, v).apply()

    fun getButtonSize(ctx: Context): Int = prefs(ctx).getInt(KEY_BUTTON_SIZE, 48)
    fun setButtonSize(ctx: Context, v: Int) = prefs(ctx).edit().putInt(KEY_BUTTON_SIZE, v.coerceIn(36, 72)).apply()

    fun getFloatingPos(ctx: Context): Pair<Int, Int> {
        val p = prefs(ctx)
        // Default: top-right with some margin
        val x = p.getInt(KEY_FLOATING_X, -1)
        val y = p.getInt(KEY_FLOATING_Y, -1)
        return x to y
    }
    fun setFloatingPos(ctx: Context, x: Int, y: Int) =
        prefs(ctx).edit().putInt(KEY_FLOATING_X, x).putInt(KEY_FLOATING_Y, y).apply()

    fun getEndpoint(ctx: Context): String =
        prefs(ctx).getString(KEY_ENDPOINT, DEFAULT_ENDPOINT) ?: DEFAULT_ENDPOINT
    fun setEndpoint(ctx: Context, v: String) =
        prefs(ctx).edit().putString(KEY_ENDPOINT, v).apply()

    fun getGlobalTone(ctx: Context): String =
        prefs(ctx).getString(KEY_GLOBAL_TONE, "professional") ?: "professional"
    fun setGlobalTone(ctx: Context, v: String) =
        prefs(ctx).edit().putString(KEY_GLOBAL_TONE, v).apply()

    fun getGlobalGoal(ctx: Context): String =
        prefs(ctx).getString(KEY_GLOBAL_GOAL, "general") ?: "general"
    fun setGlobalGoal(ctx: Context, v: String) =
        prefs(ctx).edit().putString(KEY_GLOBAL_GOAL, v).apply()

    // Per-app settings — returns null if no per-app override
    data class PerAppConfig(
        val enabled: Boolean = true,
        val autoSuggest: Boolean = true,
        val floatingButton: Boolean = true,
        val tone: String = "professional",
        val goal: String = "general"
    )

    fun getPerApp(ctx: Context, packageName: String): PerAppConfig {
        val raw = prefs(ctx).getString(KEY_PER_APP_PREFIX + packageName, null) ?: return PerAppConfig()
        return try {
            val j = JSONObject(raw)
            PerAppConfig(
                enabled = j.optBoolean("enabled", true),
                autoSuggest = j.optBoolean("autoSuggest", true),
                floatingButton = j.optBoolean("floatingButton", true),
                tone = j.optString("tone", "professional"),
                goal = j.optString("goal", "general")
            )
        } catch (e: Exception) { PerAppConfig() }
    }

    fun setPerApp(ctx: Context, packageName: String, cfg: PerAppConfig) {
        val j = JSONObject()
        j.put("enabled", cfg.enabled)
        j.put("autoSuggest", cfg.autoSuggest)
        j.put("floatingButton", cfg.floatingButton)
        j.put("tone", cfg.tone)
        j.put("goal", cfg.goal)
        prefs(ctx).edit().putString(KEY_PER_APP_PREFIX + packageName, j.toString()).apply()
    }

    fun getAllPerApp(ctx: Context): Map<String, PerAppConfig> {
        val out = mutableMapOf<String, PerAppConfig>()
        val all = prefs(ctx).all
        for ((k, v) in all) {
            if (k.startsWith(KEY_PER_APP_PREFIX) && v is String) {
                val pkg = k.removePrefix(KEY_PER_APP_PREFIX)
                try {
                    val j = JSONObject(v)
                    out[pkg] = PerAppConfig(
                        enabled = j.optBoolean("enabled", true),
                        autoSuggest = j.optBoolean("autoSuggest", true),
                        floatingButton = j.optBoolean("floatingButton", true),
                        tone = j.optString("tone", "professional"),
                        goal = j.optString("goal", "general")
                    )
                } catch (_: Exception) {}
            }
        }
        return out
    }

    // App-specific defaults for known apps
    val APP_DEFAULTS: Map<String, Pair<String, String>> = mapOf(
        "com.whatsapp" to ("casual" to "social"),
        "com.google.android.gm" to ("professional" to "email"),
        "com.android.messaging" to ("casual" to "general"),
        "com.google.android.apps.messaging" to ("casual" to "general"),
        "com.instagram.android" to ("casual" to "social"),
        "com.facebook.katana" to ("casual" to "social"),
        "com.linkedin.android" to ("professional" to "professional"),
        "com.twitter.android" to ("casual" to "social"),
        "org.telegram.messenger" to ("casual" to "general"),
        "com.slack" to ("professional" to "business"),
        "com.microsoft.teams" to ("professional" to "business"),
        "com.google.android.apps.docs.editors.docs" to ("professional" to "academic"),
    )

    fun defaultToneFor(pkg: String): String = APP_DEFAULTS[pkg]?.first ?: "professional"
    fun defaultGoalFor(pkg: String): String = APP_DEFAULTS[pkg]?.second ?: "general"
}
