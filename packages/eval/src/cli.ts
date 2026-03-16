#!/usr/bin/env node

import { runEval } from "@inclusive-ai/eval-core";
import { allScenarios, domains } from "./index";
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
  const domainFilter = getArg("--domain");
  const severityFilter = getArg("--severity")?.split(",");
  const format = getArg("--format") ?? "cli";

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Set ANTHROPIC_API_KEY or OPENAI_API_KEY");
    process.exit(1);
  }

  // Resolve --domain to its categories
  let resolvedCategories: string[] | undefined = categoryFilter;
  if (domainFilter) {
    const domain = domains.find((d) => d.id === domainFilter);
    if (!domain) {
      console.error(
        `Unknown domain "${domainFilter}". Available domains: ${domains.map((d) => d.id).join(", ")}`,
      );
      process.exit(1);
    }
    // Combine domain categories with any explicit --category filters
    const domainCategories = domain.categories;
    if (categoryFilter) {
      // Intersection: only categories that are both in the domain and explicitly requested
      resolvedCategories = categoryFilter.filter((c) => domainCategories.includes(c));
    } else {
      resolvedCategories = domainCategories;
    }
  }

  const scenarios: TextEvalScenario[] = allScenarios;

  console.log(`Running ${scenarios.length} scenarios...`);
  if (domainFilter) {
    console.log(`Domain filter: ${domainFilter}`);
  }
  if (resolvedCategories) {
    console.log(`Category filter: ${resolvedCategories.join(", ")}`);
  }

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
      categories: resolvedCategories,
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
