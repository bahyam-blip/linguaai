import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GrammarIssue {
  type: "grammar" | "spelling" | "punctuation" | "style" | "clarity" | "vocabulary";
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

interface GrammarResponse {
  issues: GrammarIssue[];
  correctedText: string;
  tone: ToneInfo;
  vocabulary: VocabSuggestion[];
  stats: {
    wordCount: number;
    sentenceCount: number;
    averageWordsPerSentence: number;
    readabilityScore: number;
    readingTime: string;
    uniqueWords: number;
    lexicalDiversity: number;
  };
  overallScore: number;
}

const SYSTEM_PROMPT = `You are an advanced grammar and writing assistant, similar to Grammarly but more thorough. Analyze the user's text and return ONLY a valid JSON object (no markdown fences, no extra text) with this exact structure:

{
  "issues": [
    {
      "type": "grammar" | "spelling" | "punctuation" | "style" | "clarity" | "vocabulary",
      "original": "the exact substring from the source text",
      "suggestion": "the corrected or improved version",
      "explanation": "short explanation of why this change is recommended",
      "severity": "critical" | "warning" | "suggestion",
      "start": <character offset where 'original' begins in the source text, 0-indexed>,
      "end": <character offset where 'original' ends (exclusive)>
    }
  ],
  "correctedText": "the fully corrected text with all critical and warning issues applied",
  "tone": {
    "tone": "e.g. Professional, Casual, Academic, Confident, Friendly, Urgent",
    "confidence": <0-100>,
    "formality": "formal" | "neutral" | "informal",
    "sentiment": "positive" | "neutral" | "negative"
  },
  "vocabulary": [
    {
      "word": "a word from the text that could be improved",
      "alternatives": ["better", "stronger", "more precise words"],
      "reason": "why these alternatives are better"
    }
  ],
  "stats": {
    "wordCount": <number>,
    "sentenceCount": <number>,
    "averageWordsPerSentence": <number>,
    "readabilityScore": <0-100, Flesch Reading Ease>,
    "readingTime": "e.g. '1 min 30 sec'",
    "uniqueWords": <number>,
    "lexicalDiversity": <0-1, ratio of unique words to total words>
  },
  "overallScore": <0-100, overall writing quality score>
}

CRITICAL RULES:
1. Return ONLY the JSON. No prose, no markdown fences.
2. 'start' and 'end' MUST be exact character offsets in the original text. Count carefully.
3. 'original' MUST exactly match the substring at [start, end) in the source text.
4. Be conservative with suggestions — only flag genuine issues.
5. For vocabulary, suggest 2-4 stronger alternatives per weak word.
6. Reading time is based on ~200 wpm reading speed.
7. If the text is empty or too short, return a valid JSON with empty arrays and zero stats.`;

function fallbackStats(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const wordCount = words.length;
  const sentenceCount = sentences.length || 1;
  const uniqueWords = new Set(words.map((w) => w.toLowerCase())).size;
  const avgWords = wordCount / sentenceCount;
  // Flesch Reading Ease approximation
  const syllables = words.reduce((acc, w) => {
    const m = w.toLowerCase().match(/[aeiouy]+/g);
    return acc + (m ? m.length : 1);
  }, 0);
  const flesch = wordCount > 0
    ? Math.max(0, Math.min(100, 206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllables / wordCount)))
    : 0;
  const minutes = wordCount / 200;
  const m = Math.floor(minutes);
  const s = Math.round((minutes - m) * 60);
  const readingTime = wordCount === 0 ? "0 sec" : `${m} min ${s} sec`;
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text: string = (body?.text ?? "").toString();
    const mode: string = (body?.mode ?? "full").toString();

    if (!text || text.trim().length === 0) {
      return NextResponse.json<GrammarResponse>({
        issues: [],
        correctedText: "",
        tone: { tone: "—", confidence: 0, formality: "neutral", sentiment: "neutral" },
        vocabulary: [],
        stats: fallbackStats(""),
        overallScore: 0,
      });
    }

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Analyze the following text:\n\n${text}` },
      ],
      thinking: { type: "disabled" },
      temperature: 0.2,
    });

    const raw = completion.choices?.[0]?.message?.content ?? "";
    let parsed: Partial<GrammarResponse>;
    try {
      const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {};
    }

    const stats = parsed.stats && typeof parsed.stats.wordCount === "number"
      ? parsed.stats
      : fallbackStats(text);

    const response: GrammarResponse = {
      issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 50) : [],
      correctedText: typeof parsed.correctedText === "string" ? parsed.correctedText : text,
      tone: parsed.tone ?? { tone: "—", confidence: 0, formality: "neutral", sentiment: "neutral" },
      vocabulary: Array.isArray(parsed.vocabulary) ? parsed.vocabulary.slice(0, 20) : [],
      stats,
      overallScore: typeof parsed.overallScore === "number" ? parsed.overallScore : 0,
    };

    if (mode === "stats-only") {
      return NextResponse.json({ stats, overallScore: response.overallScore });
    }

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("grammar route error:", err?.message || err);
    const text = "";
    return NextResponse.json(
      {
        error: err?.message || "Grammar analysis failed",
        issues: [],
        correctedText: "",
        tone: { tone: "—", confidence: 0, formality: "neutral", sentiment: "neutral" },
        vocabulary: [],
        stats: fallbackStats(text),
        overallScore: 0,
      },
      { status: 200 }
    );
  }
}
