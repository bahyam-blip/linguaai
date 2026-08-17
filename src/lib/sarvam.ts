/**
 * Sarvam AI client utility.
 *
 * Wraps the Sarvam Chat Completion API
 *   POST https://api.sarvam.ai/v1/chat/completions  (model: sarvam-105b)
 *
 * The API key is read from the SARVAM_API_KEY environment variable.
 * It is injected at build time via the GitHub Actions workflow so the
 * secret never ships in the client bundle.
 */

const SARVAM_API_URL = "https://api.sarvam.ai/v1/chat/completions";
const SARVAM_MODEL = "sarvam-105b";

export interface SarvamMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CallSarvamOptions {
  temperature?: number;
  maxTokens?: number;
}

/**
 * Call the Sarvam Chat Completion API and return the raw text response.
 *
 * Reasoning is disabled (reasoning_effort: null) for latency-sensitive
 * grammar / rewrite paths — we want fast, deterministic text back, not
 * chain-of-thought.
 */
export async function callSarvam(
  messages: SarvamMessage[],
  options: CallSarvamOptions = {},
): Promise<string> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new Error("SARVAM_API_KEY is not configured");
  }

  const body: Record<string, unknown> = {
    model: SARVAM_MODEL,
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 4096,
    // Disable thinking mode for fast short replies
    reasoning_effort: null,
  };

  const res = await fetch(SARVAM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Sarvam API error ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  const content: string =
    data?.choices?.[0]?.message?.content ?? "";
  return content.trim();
}

/**
 * Robustly extract a JSON object from a possibly-noisy LLM response.
 * Handles markdown fences, leading/trailing prose, and trailing commas.
 */
export function extractJson(raw: string): any | null {
  if (!raw) return null;
  let s = raw.trim();

  // Strip ```json ... ``` or ``` ... ``` fences
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  // Find the first { and the last } — extract that slice
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) {
    s = s.slice(first, last + 1);
  }

  try {
    return JSON.parse(s);
  } catch {
    // Aggressive cleanup: remove trailing commas, control chars
    try {
      const cleaned = s
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/[\u0000-\u001F]+/g, " ");
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}
