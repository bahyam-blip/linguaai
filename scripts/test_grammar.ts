// Direct test of the grammar analysis logic with the z-ai-web-dev-sdk
import ZAI from "z-ai-web-dev-sdk";

const SYSTEM_PROMPT = `You are an advanced grammar and writing assistant. Analyze the user's text and return ONLY a valid JSON object (no markdown fences, no extra text) with this exact structure:

{
  "issues": [
    {
      "type": "grammar" | "spelling" | "punctuation" | "style" | "clarity" | "vocabulary",
      "original": "the exact substring from the source text",
      "suggestion": "the corrected or improved version",
      "explanation": "short explanation of why this change is recommended",
      "severity": "critical" | "warning" | "suggestion",
      "start": <character offset where 'original' begins, 0-indexed>,
      "end": <character offset where 'original' ends (exclusive)>
    }
  ],
  "correctedText": "the fully corrected text",
  "tone": {
    "tone": "e.g. Professional, Casual, Academic",
    "confidence": <0-100>,
    "formality": "formal" | "neutral" | "informal",
    "sentiment": "positive" | "neutral" | "negative"
  },
  "vocabulary": [
    { "word": "...", "alternatives": ["..."], "reason": "..." }
  ],
  "stats": {
    "wordCount": <number>,
    "sentenceCount": <number>,
    "averageWordsPerSentence": <number>,
    "readabilityScore": <0-100>,
    "readingTime": "e.g. '1 min 30 sec'",
    "uniqueWords": <number>,
    "lexicalDiversity": <0-1>
  },
  "overallScore": <0-100>
}

Return ONLY the JSON.`;

const text = "I has been working on this project for almost three months now, and i think we are ready to launch. The team have done a great job, and their commited to delivering high-quality results.";

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
const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
const parsed = JSON.parse(cleaned);

console.log("=== ISSUES ===");
console.log(JSON.stringify(parsed.issues, null, 2));
console.log("\n=== TONE ===");
console.log(JSON.stringify(parsed.tone, null, 2));
console.log("\n=== VOCABULARY ===");
console.log(JSON.stringify(parsed.vocabulary, null, 2));
console.log("\n=== STATS ===");
console.log(JSON.stringify(parsed.stats, null, 2));
console.log("\n=== OVERALL SCORE ===");
console.log(parsed.overallScore);
console.log("\n=== CORRECTED TEXT ===");
console.log(parsed.correctedText);
