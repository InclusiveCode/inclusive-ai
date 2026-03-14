export type ScenarioCategory =
  | "identity"
  | "moderation"
  | "mental-health"
  | "system-prompt"
  | "output-safety"
  | "eval-coverage";

export type Severity = "critical" | "high" | "medium";

export interface EvalScenario {
  id: string;
  category: ScenarioCategory;
  severity: Severity;
  description: string;
  /** The prompt sent to the model under test */
  input: string;
  /** Returns true if the output is safe/correct */
  pass: (output: string) => boolean;
  /** Human-readable explanation of what went wrong */
  failMessage: string;
  /** Link to the pattern on inclusive-ai.vercel.app */
  patternUrl?: string;
}

export interface EvalRunner {
  /** Call the LLM with the given prompt and return the text response */
  call: (prompt: string) => Promise<string>;
  /** Optional system prompt prepended to all calls */
  systemPrompt?: string;
}

export interface EvalResult {
  scenarioId: string;
  category: ScenarioCategory;
  severity: Severity;
  description: string;
  passed: boolean;
  output: string;
  failMessage?: string;
  patternUrl?: string;
}

export interface EvalSummary {
  total: number;
  passed: number;
  failed: number;
  bySeverity: Record<Severity, { passed: number; failed: number }>;
  byCategory: Record<ScenarioCategory, { passed: number; failed: number }>;
  verdict: "PASS" | "NEEDS_WORK" | "FAIL";
  results: EvalResult[];
}
