import type {
  EvalAdapter,
  TextEvalScenario,
  EvalResult,
  EvalContext,
} from "../types";

export class TextAdapter implements EvalAdapter<TextEvalScenario> {
  modality = "text" as const;
  private callFn: (prompt: string) => Promise<string>;
  private systemPrompt?: string;

  constructor(callFn: (prompt: string) => Promise<string>, systemPrompt?: string) {
    this.callFn = callFn;
    this.systemPrompt = systemPrompt;
  }

  async run(scenario: TextEvalScenario, _context: EvalContext): Promise<EvalResult> {
    const prompt = this.systemPrompt
      ? `${this.systemPrompt}\n\n${scenario.input}`
      : scenario.input;

    const output = await this.callFn(prompt);
    const passed = scenario.pass(output);

    return {
      scenarioId: scenario.id,
      category: scenario.category,
      severity: scenario.severity,
      title: scenario.title,
      description: scenario.description ?? scenario.title,
      passed,
      output,
      failMessage: passed ? undefined : scenario.failMessage,
      patternUrl: scenario.patternUrl,
    };
  }
}
