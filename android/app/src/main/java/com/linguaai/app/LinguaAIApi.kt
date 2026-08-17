package com.linguaai.app

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

class LinguaAIApi(private val context: Context) {
    private val executor = Executors.newSingleThreadExecutor { r -> Thread(r, "LinguaAI-Api").also { it.isDaemon = true } }

    interface Callback<T> { fun onSuccess(result: T); fun onError(message: String) }

    data class Issue(
        val type: String, val original: String, val suggestion: String,
        val explanation: String, val severity: String
    )
    data class Analysis(
        val issues: List<Issue>, val correctedText: String, val tone: String,
        val formality: String, val sentiment: String,
        val confidence: Int, val overallScore: Int, val wordCount: Int
    )
    data class RewriteResult(val result: String, val alternatives: List<String> = emptyList())

    companion object {
        private const val TAG = "LinguaAIApi"
        // The API endpoint — calls the Next.js backend which uses Z.ai LLM.
        // Users can override this in the app settings.
        private const val DEFAULT_ENDPOINT = "https://preview-linguaai.space-z.ai/api/grammar"
    }

    private fun endpointUrl(): String {
        val prefs = context.getSharedPreferences("linguaai_settings", Context.MODE_PRIVATE)
        val ep = prefs.getString("endpoint", DEFAULT_ENDPOINT) ?: DEFAULT_ENDPOINT
        // Normalize: ensure it ends with /api/grammar
        return when {
            ep.endsWith("/api/grammar") -> ep
            ep.endsWith("/api/") -> ep + "grammar"
            ep.endsWith("/api") -> ep + "/grammar"
            ep.endsWith("/") -> ep + "api/grammar"
            else -> "$ep/api/grammar"
        }
    }

    private fun rewriteUrl(): String {
        return endpointUrl().removeSuffix("/grammar") + "/rewrite"
    }

    fun analyze(text: String, goal: String, cb: Callback<Analysis>) {
        executor.execute {
            try {
                val payload = JSONObject().apply {
                    put("text", text)
                    put("goal", goal)
                }
                val raw = post(endpointUrl(), payload)
                val j = JSONObject(raw)
                val issuesArr = j.optJSONArray("issues") ?: JSONArray()
                val issues = (0 until issuesArr.length()).map { i ->
                    val ij = issuesArr.getJSONObject(i)
                    Issue(
                        type = ij.optString("type", "grammar"),
                        original = ij.optString("original", ""),
                        suggestion = ij.optString("suggestion", ""),
                        explanation = ij.optString("explanation", ""),
                        severity = ij.optString("severity", "suggestion")
                    )
                }.filter { it.original.isNotEmpty() && it.suggestion.isNotEmpty() }
                val tone = j.optJSONObject("tone")
                val stats = j.optJSONObject("stats")
                val analysis = Analysis(
                    issues = issues,
                    correctedText = j.optString("correctedText", text),
                    tone = tone?.optString("tone", "—") ?: "—",
                    formality = tone?.optString("formality", "neutral") ?: "neutral",
                    sentiment = tone?.optString("sentiment", "neutral") ?: "neutral",
                    confidence = tone?.optInt("confidence", 0) ?: 0,
                    overallScore = j.optInt("overallScore", 100),
                    wordCount = stats?.optInt("wordCount", 0) ?: 0
                )
                mainHandler().post { cb.onSuccess(analysis) }
            } catch (e: Exception) {
                Log.e(TAG, "analyze failed", e)
                mainHandler().post { cb.onError(e.message ?: "Analysis failed") }
            }
        }
    }

    fun rewrite(text: String, action: String, instruction: String? = null, targetLang: String? = null, goal: String, cb: Callback<RewriteResult>) {
        executor.execute {
            try {
                val payload = JSONObject().apply {
                    put("text", text)
                    put("action", action)
                    put("goal", goal)
                    instruction?.let { put("instruction", it) }
                    targetLang?.let { put("targetLang", it) }
                }
                val raw = post(rewriteUrl(), payload)
                val j = JSONObject(raw)
                if (j.has("error")) {
                    mainHandler().post { cb.onError(j.optString("error", "Rewrite failed")) }
                    return@execute
                }
                val result = j.optString("result", "")
                val altsArr = j.optJSONArray("alternatives")
                val alts = if (altsArr != null) (0 until altsArr.length()).map { altsArr.getString(it) } else emptyList()
                mainHandler().post { cb.onSuccess(RewriteResult(result, alts)) }
            } catch (e: Exception) {
                Log.e(TAG, "rewrite failed", e)
                mainHandler().post { cb.onError(e.message ?: "Rewrite failed") }
            }
        }
    }

    private fun post(url: String, payload: JSONObject): String {
        val conn = (java.net.URL(url).openConnection() as java.net.HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 30000
            readTimeout = 60000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            setRequestProperty("Accept", "application/json")
        }
        try {
            val body = payload.toString().toByteArray(Charsets.UTF_8)
            conn.outputStream.use { it.write(body) }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val response = stream?.bufferedReader()?.use { it.readText() } ?: ""
            if (code !in 200..299) {
                throw RuntimeException("HTTP $code: ${response.take(200)}")
            }
            return response
        } finally {
            conn.disconnect()
        }
    }

    private fun mainHandler() = android.os.Handler(android.os.Looper.getMainLooper())
}
