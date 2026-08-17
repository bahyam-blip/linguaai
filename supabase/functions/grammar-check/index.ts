// Supabase Edge Function: grammar-check
// Proxies grammar analysis requests to Sarvam AI Chat Completion API.
// The SARVAM_API_KEY is stored as a Supabase secret — never exposed to clients.

const SARVAM_API_URL = "https://api.sarvam.ai/v1/chat/completions";
const SARVAM_MODEL = "sarvam-105b";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const GRAMMAR_SYSTEM_PROMPT = "You are LinguaAI, an expert grammar and writing assistant. Analyze the provided text for grammar, spelling, punctuation, style, clarity, vocabulary, and capitalization issues.\n\nReturn your analysis as a JSON object with this exact structure:\n{\n  \"issues\": [\n    {\n      \"type\": \"grammar|spelling|punctuation|style|clarity|vocabulary|capitalization\",\n      \"severity\": \"critical|warning|suggestion\",\n      \"original\": \"exact substring from the text that has an issue\",\n      \"suggestion\": \"the corrected version\",\n      \"explanation\": \"brief explanation of the issue\",\n      \"start\": 0,\n      \"end\": 0\n    }\n  ],\n  \"correctedText\": \"the fully corrected text\",\n  \"overallScore\": 100,\n  \"tone\": \"detected tone\",\n  \"stats\": {\n    \"wordCount\": 0,\n    \"sentenceCount\": 0,\n    \"averageWordsPerSentence\": 0,\n    \"readabilityScore\": 0,\n    \"readingTime\": \"0s\",\n    \"uniqueWords\": 0,\n    \"lexicalDiversity\": 0\n  }\n}\n\nRules:\n- \"original\" must be an EXACT substring from the input text\n- Only include issues where the suggestion genuinely differs from the original\n- If the text is already correct, return an empty issues array\n- severity \"critical\" = grammar/spelling; \"warning\" = punctuation/capitalization; \"suggestion\" = style/clarity";

const REWRITE_SYSTEM_PROMPT = "You are LinguaAI, an expert writing assistant. Rewrite or transform the given text according to the specified action. Return ONLY the rewritten text.";

function extractJson(raw: string): any | null {
  if (!raw) return null;
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) {
    s = s.slice(first, last + 1);
  }
  try {
    return JSON.parse(s);
  } catch {
    try {
      const cleaned = s.replace(/,\s*([}\]])/g, "$1").replace(/[\u0000-\u001F]+/g, " ");
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

async function callSarvam(messages: Array<{ role: string; content: string }>, temperature: number, maxTokens: number): Promise<string> {
  const apiKey = Deno.env.get("SARVAM_API_KEY");
  if (!apiKey) throw new Error("SARVAM_API_KEY is not configured");

  const res = await fetch(SARVAM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": apiKey,
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: SARVAM_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
      reasoning_effort: null,
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const errBody = await res.json();
      detail = errBody?.error?.message || JSON.stringify(errBody);
    } catch {
      try { detail = await res.text(); } catch { detail = ""; }
    }
    throw new Error("Sarvam API error " + res.status + ": " + detail.slice(0, 200));
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

async function handleGrammar(body: any): Promise<Response> {
  const { text, goal, mode } = body;
  if (!text || typeof text !== "string") {
    return new Response(JSON.stringify({ error: "Missing 'text' field" }), { status: 400, headers: corsHeaders });
  }

  let systemPrompt = GRAMMAR_SYSTEM_PROMPT;
  if (mode === "stats-only") {
    systemPrompt += "\n\nReturn only the overallScore and an empty issues array.";
  }

  const content = await callSarvam(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Analyze this text:\n\n" + text },
    ],
    0.2,
    4096,
  );

  const parsed = extractJson(content);
  if (!parsed) {
    return new Response(JSON.stringify({ error: "Could not parse analysis", raw: content.slice(0, 500) }), { status: 502, headers: corsHeaders });
  }

  const issues = Array.isArray(parsed.issues) ? parsed.issues.filter((i: any) => i && i.original && i.suggestion) : [];
  const correctedText = typeof parsed.correctedText === "string" ? parsed.correctedText : text;
  const overallScore = typeof parsed.overallScore === "number" ? parsed.overallScore : 100;

  return new Response(JSON.stringify({
    issues,
    correctedText,
    overallScore,
    tone: parsed.tone || "neutral",
    stats: parsed.stats || {
      wordCount: text.trim().split(/\s+/).filter(Boolean).length,
      sentenceCount: 0,
      averageWordsPerSentence: 0,
      readabilityScore: overallScore,
      readingTime: "0s",
      uniqueWords: 0,
      lexicalDiversity: 0,
    },
  }), { headers: corsHeaders });
}

async function handleRewrite(body: any): Promise<Response> {
  const { text, action, instruction, targetLang } = body;
  if (!text || typeof text !== "string") {
    return new Response(JSON.stringify({ error: "Missing 'text' field" }), { status: 400, headers: corsHeaders });
  }

  const actionPrompts: Record<string, string> = {
    improve: "Improve the clarity, flow, and overall quality of this text.",
    rewrite: "Rewrite this text in a different way while preserving the meaning.",
    rephrase: "Rephrase this text using different words.",
    shorten: "Shorten this text while keeping all key information.",
    expand: "Expand this text with more detail.",
    simplify: "Simplify this text to make it easier to understand.",
    clarify: "Clarify this text to make it more precise.",
    professional: "Rewrite this text in a professional business tone.",
    formal: "Rewrite this text in a formal tone.",
    casual: "Rewrite this text in a casual, friendly tone.",
    ai_command: instruction || "Improve this text.",
  };

  let userPrompt = actionPrompts[action] || actionPrompts.improve;
  if (action === "translate" && targetLang) {
    userPrompt = "Translate this text to " + targetLang + ".";
  }

  const content = await callSarvam(
    [
      { role: "system", content: REWRITE_SYSTEM_PROMPT },
      { role: "user", content: userPrompt + "\n\nText: " + text },
    ],
    0.7,
    4096,
  );

  return new Response(JSON.stringify({ result: content.trim() }), { headers: corsHeaders });
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Only POST is supported" }), { status: 405, headers: corsHeaders });
    }
    try {
      const body = await req.json();
      if (body.action) {
        return await handleRewrite(body);
      }
      return await handleGrammar(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isAuthError = message.includes("SARVAM_API_KEY");
      return new Response(JSON.stringify({ error: isAuthError ? "Server API key not configured." : message }), { status: isAuthError ? 503 : 500, headers: corsHeaders });
    }
  },
};