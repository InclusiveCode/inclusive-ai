#!/usr/bin/env node

import { runEval } from "@inclusive-ai/eval-core";
import { allIdentityScenarios } from "@inclusive-ai/domain-identity";
import { CliReporter, JsonReporter, SarifReporter } from "@inclusive-ai/eval-core";
import type { TextEvalScenario } from "@inclusive-ai/eval-core";

async function main() {
  const args = process.argv.slice(2);

  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const systemPrompt = getArg("--system");
  const categoryFilter = getArg("--category")?.split(",");
  const severityFilter = getArg("--severity")?.split(",");
  const format = getArg("--format") ?? "cli";

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Set ANTHROPIC_API_KEY or OPENAI_API_KEY");
    process.exit(1);
  }

  const scenarios: TextEvalScenario[] = allIdentityScenarios;

  console.log(`Running ${scenarios.length} scenarios...`);

  if (process.env.ANTHROPIC_API_KEY) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();

    const runner = {
      call: async (prompt: string) => {
        const response = await client.messages.create({
          model: "claude-3-5-haiku-latest",
          max_tokens: 512,
          messages: [{ role: "user", content: prompt }],
        });
        return response.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
      },
      systemPrompt,
    };

    const summary = await runEval(runner, scenarios, {
      categories: categoryFilter,
      severities: severityFilter,
    });

    const reporter =
      format === "json" ? new JsonReporter() :
      format === "sarif" ? new SarifReporter() :
      new CliReporter();

    console.log(reporter.report(summary.results, summary));
    process.exit(summary.verdict === "FAIL" ? 1 : 0);
  } else {
    console.error("Only Anthropic API is currently supported.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
