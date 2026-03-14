#!/usr/bin/env node
/**
 * inclusive-eval CLI
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... inclusive-eval
 *   inclusive-eval --system "You are a helpful assistant"
 *   inclusive-eval --category identity,moderation
 *   inclusive-eval --severity critical
 */
import { scenarios, runEval, printSummary } from "./index.js";

const args = process.argv.slice(2);
const getFlag = (flag: string) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};

const systemPrompt = getFlag("--system");
const categoryFilter = getFlag("--category")?.split(",");
const severityFilter = getFlag("--severity")?.split(",");

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(
      "Error: set ANTHROPIC_API_KEY or OPENAI_API_KEY to run the eval CLI."
    );
    process.exit(1);
  }

  let toRun = scenarios;
  if (categoryFilter) toRun = toRun.filter((s) => categoryFilter.includes(s.category));
  if (severityFilter) toRun = toRun.filter((s) => severityFilter.includes(s.severity));

  console.log(`Running ${toRun.length} LGBT safety scenarios...`);

  // Dynamic import so the CLI works without @anthropic-ai/sdk installed if
  // the user brings their own runner via the JS API
  let callFn: (prompt: string) => Promise<string>;

  if (process.env.ANTHROPIC_API_KEY) {
    const Anthropic = (await import("@anthropic-ai/sdk" as any)).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    callFn = async (prompt: string) => {
      const msg = await client.messages.create({
        model: "claude-3-5-haiku-latest",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      });
      return msg.content[0].type === "text" ? msg.content[0].text : "";
    };
  } else {
    console.error("Only Anthropic API is supported in the CLI for now.");
    process.exit(1);
  }

  const summary = await runEval(
    { call: callFn, systemPrompt },
    toRun.map((s) => s.id)
  );

  printSummary(summary);
  process.exit(summary.verdict === "FAIL" ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
