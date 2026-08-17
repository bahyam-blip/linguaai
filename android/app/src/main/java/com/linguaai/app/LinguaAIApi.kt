package com.linguaai.app

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
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
        private val TAG = "LinguaAIApi"
        private const val DEFAULT_ENDPOINT = "https://placeholder.supabase.co/functions/v1/grammar-check"
    }

    private fun baseUrl(): String {
        val prefs = context.getSharedPreferences("linguaai_settings", Context.MODE_PRIVATE)
        val ep = prefs.getString("endpoint", DEFAULT_ENDPOINT) ?: DEFAULT_ENDPOINT
        return if (ep.endsWith("/api/grammar")) ep.removeSuffix("/api/grammar")
        else if (ep.endsWith("/api/")) ep.removeSuffix("/api/")
        else if (ep.endsWith("/api")) ep.removeSuffix("/api")
        else ep
    }

    private fun getApiKey(): String {
        val prefs = context.getSharedPreferences("linguaai_settings", Context.MODE_PRIVATE)
        return prefs.getString("supabase_anon_key", "") ?: ""
    }

    fun analyze(text: String, goal: String, cb: Callback<Analysis>) {
        executor.execute {
            try {
                val payload = JSONObject().apply {
                    put("text", text)
                    put("goal", goal)
                    put("mode", "full")
                }
                val raw = post("${baseUrl()}", payload)
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
                    tone = tone?.optString("tone", "\u2014") ?: "\u2014",
                    formality = tone?.optString("formality", "neutral") ?: "neutral",
                    sentiment = tone?.optString("sentiment", "neutral") ?: "neutral",
                    confidence = tone?.optInt("confidence", 0) ?: 0,
                    overallScore = j.optInt("overallScore", 0),
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
                val raw = post("${baseUrl()}", payload)
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
            val apiKey = getApiKey()
            if (apiKey.isNotEmpty()) {
                setRequestProperty("apikey", apiKey)
                setRequestProperty("Authorization", "Bearer $apiKey")
            }
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
