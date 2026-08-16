// Test all rewrite actions directly via the SDK
import ZAI from "z-ai-web-dev-sdk";

const zai = await ZAI.create();

async function rewrite(text: string, action: string, extra: Record<string, string> = {}) {
  const presets: Record<string, string> = {
    improve: "Improve the writing quality while preserving the original meaning.",
    professional: "Rewrite to sound professional and polished for a business context.",
    casual: "Rewrite in a casual, relaxed tone as if speaking to a friend.",
    shorten: "Make shorter and more concise while preserving key information.",
    expand: "Expand with more detail and supporting information.",
    simplify: "Simplify so it is easy to understand for a non-technical reader.",
    confident: "Rewrite to sound confident and assertive.",
    translate: "Translate to the target language preserving meaning and tone.",
    ai_command: "Follow the user's natural-language instruction precisely.",
  };
  const instruction = presets[action] || presets.improve;
  const sys = `You are a professional writing assistant. ${instruction} Return ONLY the rewritten text — no explanations, no quotes, no markdown.`;
  const user = `Text:\n${text}${extra.targetLang ? `\n\nTarget language: ${extra.targetLang}` : ""}${extra.instruction ? `\n\nInstruction: ${extra.instruction}` : ""}`;
  const c = await zai.chat.completions.create({
    messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    thinking: { type: "disabled" },
    temperature: 0.4,
  });
  return c.choices?.[0]?.message?.content?.trim() || "";
}

const text = "hey boss, gonna be late today, traffic is crazy sorry about that";

console.log("=== ORIGINAL ===");
console.log(text);

console.log("\n=== PROFESSIONAL ===");
console.log(await rewrite(text, "professional"));

console.log("\n=== SHORTEN ===");
console.log(await rewrite(text, "shorten"));

console.log("\n=== EXPAND ===");
console.log(await rewrite(text, "expand"));

console.log("\n=== SIMPLIFY ===");
console.log(await rewrite(text, "simplify"));

console.log("\n=== CONFIDENT ===");
console.log(await rewrite(text, "confident"));

console.log("\n=== TRANSLATE (Spanish) ===");
console.log(await rewrite(text, "translate", { targetLang: "Spanish" }));

console.log("\n=== AI COMMAND: 'make this sound like a CEO wrote it' ===");
console.log(await rewrite(text, "ai_command", { instruction: "Make this sound like a CEO wrote it" }));
