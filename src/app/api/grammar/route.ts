import { NextRequest, NextResponse } from "next/server";
import { callSarvam, extractJson } from "@/lib/sarvam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ----------------- Types ------------------
interface GrammarIssue {
  type: "grammar" | "spelling" | "punctuation" | "style" | "clarity" | "vocabulary" | "capitalization";
  original: string;
  suggestion: string;
  explanation: string;
  severity: "critical" | "warning" | "suggestion";
  start: number;
  end: number;
}

interface ToneInfo {
  tone: string;
  confidence: number;
  formality: "formal" | "neutral" | "informal";
  sentiment: "positive" | "neutral" | "negative";
}

interface VocabSuggestion {
  word: string;
  alternatives: string[];
  reason: string;
}

interface Stats {
  wordCount: number;
  sentenceCount: number;
  averageWordsPerSentence: number;
  readabilityScore: number;
  readingTime: string;
  uniqueWords: number;
  lexicalDiversity: number;
}

interface GrammarResponse {
  issues: GrammarIssue[];
  correctedText: string;
  tone: ToneInfo;
  vocabulary: VocabSuggestion[];
  stats: Stats;
  overallScore: number;
  scores?: {
    grammar: number;
    clarity: number;
    readability: number;
    vocabulary: number;
    tone: number;
    conciseness: number;
    engagement: number;
  };
  goal?: string;
  error?: string;
}

// ----------------- Helpers ------------------

/** Compute basic stats locally as a fallback when LLM stats are missing/invalid. */
function fallbackStats(text: string): Stats {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const wordCount = words.length;
  const sentenceCount = sentences.length || (wordCount > 0 ? 1 : 0);
  const uniqueWords = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z0-9]/gi, ""))).size;
  const avgWords = sentenceCount > 0 ? wordCount / sentenceCount : 0;
  const syllables = words.reduce((acc, w) => {
    const m = w.toLowerCase().match(/[aeiouy]+/g);
    return acc + (m && m.length > 0 ? m.length : 1);
  }, 0);
  const flesch =
    wordCount > 0 && sentenceCount > 0
      ? Math.max(0, Math.min(100, 206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllables / wordCount)))
      : 0;
  const minutes = wordCount / 200;
  const m = Math.floor(minutes);
  const s = Math.round((minutes - m) * 60);
  const readingTime = wordCount === 0 ? "0 sec" : m > 0 ? `${m} min ${s} sec` : `${s} sec`;
  return {
    wordCount,
    sentenceCount,
    averageWordsPerSentence: Number(avgWords.toFixed(1)),
    readabilityScore: Number(flesch.toFixed(1)),
    readingTime,
    uniqueWords,
    lexicalDiversity: wordCount > 0 ? Number((uniqueWords / wordCount).toFixed(2)) : 0,
  };
}

/** Validate and clean issues array. */
function validateIssues(issues: any[], text: string): GrammarIssue[] {
  if (!Array.isArray(issues)) return [];
  const valid: GrammarIssue[] = [];
  const seen = new Set<string>();
  for (const i of issues) {
    if (!i || typeof i !== "object") continue;
    const original = String(i.original ?? "").trim();
    const suggestion = String(i.suggestion ?? "").trim();
    if (!original || !suggestion || original === suggestion) continue;
    let start = Number(i.start ?? -1);
    let end = Number(i.end ?? -1);
    if (!Number.isFinite(start) || start < 0 || start >= text.length) {
      const idx = text.indexOf(original);
      if (idx < 0) continue;
      start = idx;
      end = idx + original.length;
    } else {
      // Validate the slice matches; if not, re-find
      const slice = text.slice(start, end);
      if (slice !== original) {
        const idx = text.indexOf(original);
        if (idx < 0) continue;
        start = idx;
        end = idx + original.length;
      }
    }
    if (end <= start || end > text.length) continue;
    const key = `${start}-${end}-${original}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (valid.some((v) => v.start < end && v.end > start)) continue; // skip overlaps
    const type = (["grammar", "spelling", "punctuation", "style", "clarity", "vocabulary", "capitalization"].includes(i.type)
      ? i.type : "grammar") as GrammarIssue["type"];
    const severity = (["critical", "warning", "suggestion"].includes(i.severity)
      ? i.severity : "suggestion") as GrammarIssue["severity"];
    valid.push({
      type,
      original,
      suggestion,
      explanation: String(i.explanation ?? "").trim() || "Improvement suggested.",
      severity,
      start,
      end,
    });
    if (valid.length >= 50) break;
  }
  return valid.sort((a, b) => a.start - b.start);
}

function validateVocab(vocab: any[]): VocabSuggestion[] {
  if (!Array.isArray(vocab)) return [];
  const out: VocabSuggestion[] = [];
  const seen = new Set<string>();
  for (const v of vocab) {
    if (!v || typeof v !== "object") continue;
    const word = String(v.word ?? "").trim();
    if (!word || seen.has(word.toLowerCase())) continue;
    seen.add(word.toLowerCase());
    const alts = Array.isArray(v.alternatives)
      ? v.alternatives.filter((a: any): a is string => typeof a === "string" && a.trim().length > 0).slice(0, 5)
      : [];
    if (alts.length === 0) continue;
    out.push({ word, alternatives: alts, reason: String(v.reason ?? "").trim() || "Stronger alternative." });
    if (out.length >= 20) break;
  }
  return out;
}

function validateTone(tone: any): ToneInfo {
  if (!tone || typeof tone !== "object") {
    return { tone: "—", confidence: 0, formality: "neutral", sentiment: "neutral" };
  }
  return {
    tone: String(tone.tone ?? "—"),
    confidence: typeof tone.confidence === "number" ? Math.max(0, Math.min(100, tone.confidence)) : 0,
    formality: (["formal", "neutral", "informal"].includes(tone.formality) ? tone.formality : "neutral") as ToneInfo["formality"],
    sentiment: (["positive", "neutral", "negative"].includes(tone.sentiment) ? tone.sentiment : "neutral") as ToneInfo["sentiment"],
  };
}

// ----------------- Main analyze endpoint ------------------

const SYSTEM_PROMPT = `You are an advanced grammar and writing assistant, similar to Grammarly but more thorough. Analyze the user's text and return ONLY a valid JSON object (no markdown fences, no extra prose) with this exact structure:

{
  "issues": [
    {
      "type": "grammar" | "spelling" | "punctuation" | "style" | "clarity" | "vocabulary" | "capitalization",
      "original": "the EXACT substring from the source text (case-sensitive, including spaces)",
      "suggestion": "the corrected version",
      "explanation": "short explanation of why this change is recommended",
      "severity": "critical" | "warning" | "suggestion",
      "start": <0-indexed character offset where 'original' begins>,
      "end": <character offset where 'original' ends, exclusive>
    }
  ],
  "correctedText": "the fully corrected text with all critical and warning issues applied",
  "tone": {
    "tone": "e.g. Professional, Casual, Confident, Urgent",
    "confidence": <0-100>,
    "formality": "formal" | "neutral" | "informal",
    "sentiment": "positive" | "neutral" | "negative"
  },
  "vocabulary": [
    { "word": "a word from the text", "alternatives": ["better", "stronger words"], "reason": "why these are better" }
  ],
  "scores": {
    "grammar": <0-100>,
    "clarity": <0-100>,
    "readability": <0-100>,
    "vocabulary": <0-100>,
    "tone": <0-100>,
    "conciseness": <0-100>,
    "engagement": <0-100>
  },
  "overallScore": <0-100>
}

CRITICAL RULES:
1. Return ONLY the JSON. No prose, no markdown fences.
2. "original" MUST be an EXACT case-sensitive substring of the source text. If you can't match it exactly, don't include the issue.
3. "start" and "end" MUST be exact character offsets. Count carefully — including spaces and punctuation.
4. Be conservative — only flag genuine issues.
5. For vocabulary, suggest 2-4 stronger alternatives per weak word.
6. If the text is empty or too short, return valid JSON with empty arrays and zero scores.
7. Keep explanations under 20 words.`;

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const text: string = (body?.text ?? "").toString();
    const goal: string = (body?.goal ?? "general").toString();

    if (!text || text.trim().length === 0) {
      return NextResponse.json<GrammarResponse>({
        issues: [],
        correctedText: "",
        tone: { tone: "—", confidence: 0, formality: "neutral", sentiment: "neutral" },
        vocabulary: [],
        stats: fallbackStats(""),
        overallScore: 0,
        goal,
      });
    }

    // Short-circuit for very short inputs (1-2 chars)
    if (text.trim().length < 3) {
      const stats = fallbackStats(text);
      return NextResponse.json<GrammarResponse>({
        issues: [],
        correctedText: text,
        tone: { tone: "—", confidence: 0, formality: "neutral", sentiment: "neutral" },
        vocabulary: [],
        stats,
        overallScore: 50,
        goal,
      });
    }

    const goalSuffix = goal && goal !== "general"
      ? `\n\nThe user's writing goal is: ${goal}. Adapt suggestions accordingly.`
      : "";

    const raw = await callSarvam(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Analyze the following text:\n\n${text}${goalSuffix}` },
      ],
      { temperature: 0.2 },
    );

    const parsed = extractJson(raw) || {};
    const stats = fallbackStats(text);
    const issues = validateIssues(parsed.issues, text);
    const vocabulary = validateVocab(parsed.vocabulary);
    const tone = validateTone(parsed.tone);
    const correctedText =
      typeof parsed.correctedText === "string" && parsed.correctedText.trim()
        ? parsed.correctedText
        : text;
    const overallScore =
      typeof parsed.overallScore === "number"
        ? Math.max(0, Math.min(100, Math.round(parsed.overallScore)))
        : Math.max(20, Math.min(100, 100 - issues.length * 8));
    const scores = parsed.scores && typeof parsed.scores === "object"
      ? {
          grammar: typeof parsed.scores.grammar === "number" ? parsed.scores.grammar : Math.max(40, 100 - issues.filter((i) => i.type === "grammar").length * 10),
          clarity: typeof parsed.scores.clarity === "number" ? parsed.scores.clarity : 80,
          readability: typeof parsed.scores.readability === "number" ? parsed.scores.readability : stats.readabilityScore,
          vocabulary: typeof parsed.scores.vocabulary === "number" ? parsed.scores.vocabulary : Math.round(stats.lexicalDiversity * 100),
          tone: typeof parsed.scores.tone === "number" ? parsed.scores.tone : 75,
          conciseness: typeof parsed.scores.conciseness === "number" ? parsed.scores.conciseness : 80,
          engagement: typeof parsed.scores.engagement === "number" ? parsed.scores.engagement : 75,
        }
      : undefined;

    return NextResponse.json<GrammarResponse>({
      issues,
      correctedText,
      tone,
      vocabulary,
      stats,
      overallScore,
      scores,
      goal,
    });
  } catch (err: any) {
    console.error("grammar route error:", err?.message || err, "took", Date.now() - t0, "ms");
    return NextResponse.json<GrammarResponse>(
      {
        issues: [],
        correctedText: "",
        tone: { tone: "—", confidence: 0, formality: "neutral", sentiment: "neutral" },
        vocabulary: [],
        stats: fallbackStats(""),
        overallScore: 0,
        error: err?.message || "Grammar analysis failed",
      },
      { status: 200 },
    );
  }
}
