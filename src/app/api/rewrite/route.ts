import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RewriteResponse {
  result: string;
  alternatives?: string[];
  error?: string;
}

/** Robustly extract JSON from a possibly-noisy LLM response. */
function extractJson(raw: string): any | null {
  if (!raw) return null;
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  try { return JSON.parse(s); } catch {
    try { return JSON.parse(s.replace(/,\s*([}\]])/g, "$1").replace(/[\u0000-\u001F]+/g, " ")); } catch { return null; }
  }
}

/** Call Z.ai LLM and return the raw text response. */
async function callLLM(systemPrompt: string, userPrompt: string, temperature = 0.4): Promise<string> {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    thinking: { type: "disabled" },
    temperature,
  });
  return completion.choices?.[0]?.message?.content ?? "";
}

const ACTION_PROMPTS: Record<string, { instruction: string; temp: number }> = {
  improve: { instruction: "Improve the writing quality while preserving the original meaning. Make it clearer, more natural, and more effective.", temp: 0.4 },
  rewrite: { instruction: "Rewrite the text in a fresh way while preserving the original meaning.", temp: 0.6 },
  rephrase: { instruction: "Rephrase the text using different words and sentence structure while preserving the meaning.", temp: 0.5 },
  shorten: { instruction: "Make the text shorter and more concise while preserving all key information and meaning.", temp: 0.3 },
  expand: { instruction: "Expand the text with more detail, examples, and supporting information while preserving the original meaning.", temp: 0.5 },
  simplify: { instruction: "Simplify the text so it is easy to understand for a non-technical reader. Use simpler words and shorter sentences.", temp: 0.3 },
  clarify: { instruction: "Make the text clearer and easier to understand while preserving the meaning.", temp: 0.3 },
  professional: { instruction: "Rewrite the text to sound professional and polished, suitable for a business context.", temp: 0.4 },
  formal: { instruction: "Rewrite the text in a formal tone suitable for official or academic contexts.", temp: 0.4 },
  casual: { instruction: "Rewrite the text in a casual, relaxed tone as if speaking to a friend.", temp: 0.5 },
  friendly: { instruction: "Rewrite the text in a warm, friendly, and approachable tone.", temp: 0.5 },
  confident: { instruction: "Rewrite the text to sound confident and assertive.", temp: 0.4 },
  polite: { instruction: "Rewrite the text to sound polite and respectful.", temp: 0.4 },
  diplomatic: { instruction: "Rewrite the text to sound more polite and respectful.", temp: 0.4 },
  persuasive: { instruction: "Rewrite the text to be more persuasive and compelling.", temp: 0.4 },
  concise: { instruction: "Make the text more concise — remove unnecessary words while preserving meaning.", temp: 0.3 },
  direct: { instruction: "Rewrite the text to be more direct and to the point.", temp: 0.3 },
  empathetic: { instruction: "Rewrite the text to be more empathetic and understanding.", temp: 0.5 },
  enthusiastic: { instruction: "Rewrite the text to sound more enthusiastic and energetic.", temp: 0.5 },
  authoritative: { instruction: "Rewrite the text to sound more authoritative and expert.", temp: 0.4 },
  natural: { instruction: "Rewrite the text to sound more natural and conversational.", temp: 0.4 },
  engaging: { instruction: "Rewrite the text to be more engaging and interesting to read.", temp: 0.5 },
  stronger: { instruction: "Rewrite the text to make the language stronger and more impactful.", temp: 0.4 },
  fix: { instruction: "Fix any grammar, spelling, and punctuation errors while preserving the original style and meaning.", temp: 0.2 },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text: string = (body?.text ?? "").toString();
    const action: string = (body?.action ?? "improve").toString().toLowerCase();
    const instruction: string = (body?.instruction ?? "").toString().trim();
    const targetLang: string = (body?.targetLang ?? "").toString().trim();
    const context: string = (body?.context ?? "").toString().trim();
    const goal: string = (body?.goal ?? "general").toString();

    if (!text.trim()) {
      return NextResponse.json<RewriteResponse>({ result: "", error: "No text provided" });
    }

    let systemPrompt: string;
    let userPrompt: string;
    let temperature = 0.4;

    if (action === "translate") {
      if (!targetLang) {
        return NextResponse.json<RewriteResponse>({ result: "", error: "targetLang required for translate" });
      }
      systemPrompt = `You are a professional translator. Translate the user's text into ${targetLang}. Preserve the original meaning, tone, and context. Return ONLY the translated text — no explanations, no quotes, no markdown.`;
      userPrompt = `Translate to ${targetLang}:\n\n${text}`;
      temperature = 0.3;
    } else if (action === "explain") {
      systemPrompt = `You are a writing tutor. Explain the user's text in plain language. Cover: meaning, grammar, word choice, and any improvements. Be concise (under 150 words). Return ONLY plain text, no markdown headers.`;
      userPrompt = `Explain this:\n\n${text}`;
      temperature = 0.3;
    } else if (action === "ai_command" || action === "ask_ai") {
      if (!instruction) {
        return NextResponse.json<RewriteResponse>({ result: "", error: "instruction required for ai_command" });
      }
      systemPrompt = `You are an AI writing assistant. The user will give you a natural-language instruction about how to modify their text. Follow the instruction precisely. Preserve the original meaning unless the user explicitly asks for a change in meaning. Return ONLY the modified text — no explanations, no quotes, no markdown fences, no preamble. Preserve the original meaning unless the user explicitly asks for a change in meaning.`;
      userPrompt = `Instruction: ${instruction}\n\nText:\n${text}\n${context ? `Surrounding context:\n${context}\n` : ""}Return only the modified text.`;
      temperature = 0.4;
    } else if (action === "alternatives") {
      const preset = ACTION_PROMPTS["rewrite"];
      systemPrompt = `You are a writing assistant. Provide 3 alternative rewrites of the user's text. ${preset.instruction} Return ONLY a JSON object: {"alternatives": ["rewrite 1", "rewrite 2", "rewrite 3"]}. No markdown, no prose.`;
      userPrompt = `Text:\n${text}`;
      temperature = 0.6;
    } else {
      const preset = ACTION_PROMPTS[action] || ACTION_PROMPTS.improve;
      systemPrompt = `You are a professional writing assistant. ${preset.instruction} Return ONLY the rewritten text — no explanations, no quotes, no markdown fences, no preamble. Preserve the original meaning.`;
      userPrompt = `${context ? `Context:\n${context}\n\n` : ""}Text to rewrite:\n${text}`;
      temperature = preset.temp;
    }

    const raw = await callLLM(systemPrompt, userPrompt, temperature);

    if (action === "alternatives") {
      const parsed = extractJson(raw);
      const alts = parsed?.alternatives && Array.isArray(parsed.alternatives)
        ? parsed.alternatives.filter((a: any): a is string => typeof a === "string" && a.trim()).slice(0, 5)
        : [];
      return NextResponse.json<RewriteResponse>({
        result: alts[0] || text,
        alternatives: alts,
      });
    }

    // Clean the result
    let result = raw.trim();
    // Strip markdown fences
    if (result.startsWith("```") && result.endsWith("```")) {
      result = result.replace(/^```(?:\w+)?\s*/, "").replace(/\s*```$/, "").trim();
    }
    // Strip wrapping quotes
    if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'"))) {
      result = result.slice(1, -1);
    }

    return NextResponse.json<RewriteResponse>({ result });
  } catch (err: any) {
    console.error("rewrite route error:", err?.message || err);
    return NextResponse.json<RewriteResponse>(
      { result: "", error: err?.message || "Rewrite failed" },
      { status: 200 },
    );
  }
}
