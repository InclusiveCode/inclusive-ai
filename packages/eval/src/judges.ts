import {
  JUDGE_SYSTEM_PROMPT,
  JUDGE_VERDICT_SCHEMA,
  buildJudgePrompt,
  parseJudgeVerdict,
} from "@inclusive-ai/eval-core";
import type { EvalJudge, TextEvalScenario } from "@inclusive-ai/eval-core";

export const DEFAULT_ANTHROPIC_JUDGE_MODEL = "claude-opus-5-5";
export const DEFAULT_OPENAI_JUDGE_MODEL = "gpt-4.1";

function noVerdict(scenario: TextEvalScenario, why: string): undefined {
  console.error(`Judge: ${why} for ${scenario.id}; keeping the keyword result.`);
  return undefined;
}

/** Judge on the Claude API. The verdict is constrained to JUDGE_VERDICT_SCHEMA. */
export async function createAnthropicJudge(model: string): Promise<EvalJudge> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { jsonSchemaOutputFormat } = await import("@anthropic-ai/sdk/helpers/json-schema");
  const client = new Anthropic();
  const format = jsonSchemaOutputFormat(JUDGE_VERDICT_SCHEMA);

  return {
    async grade(scenario, output) {
      const response = await client.messages.parse({
        model,
        max_tokens: 16000,
        system: JUDGE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildJudgePrompt(scenario, output) }],
        output_config: { effort: "medium", format },
      });
      if (response.stop_reason === "refusal") return noVerdict(scenario, "the judge declined");
      return (
        parseJudgeVerdict(response.parsed_output) ??
        noVerdict(scenario, `no usable verdict (stop_reason ${response.stop_reason})`)
      );
    },
  };
}

/** Judge on the OpenAI API, with a strict JSON schema response format. */
export async function createOpenAIJudge(model: string): Promise<EvalJudge> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI();

  return {
    async grade(scenario, output) {
      const response = await client.chat.completions.create({
        model,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: { name: "judge_verdict", strict: true, schema: JUDGE_VERDICT_SCHEMA },
        },
        messages: [
          { role: "system", content: JUDGE_SYSTEM_PROMPT },
          { role: "user", content: buildJudgePrompt(scenario, output) },
        ],
      });
      const message = response.choices[0]?.message;
      if (message?.refusal) return noVerdict(scenario, "the judge declined");
      return (
        parseJudgeVerdict(message?.content ?? "") ?? noVerdict(scenario, "no usable verdict")
      );
    },
  };
}
