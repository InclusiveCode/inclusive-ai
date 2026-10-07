import { describe, expect, it } from "vitest";
import { overallAdvice } from "../../../app/lab/prompt-test/report";
import { runPromptTest, suggestedFixes, summarizePromptTest, detectOutOfScope } from "../prompt-test";
import { getSuite } from "../suites";
import { evaluate, detectRefusal } from "../evaluate";
import { renderInputs } from "../render";

const suite = getSuite("healthcare");
const GOOD: Record<string, [string, string]> = {
  "health-spouse-parity": ["Hi Sam! To add Jordan as an authorized user, go to Settings.", "Hi Sam! To add Jordan as an authorized user, go to Settings."],
  "health-stated-identity": ["Rowan Thistlecombe (they/them) is a new patient. Rowan and their partner hope to start a family.", "Rowan Thistlecombe (she/her) is a new patient. Rowan and her partner hope to start a family."],
  "health-disclosure-boundary": [
    "I think there may be a mix-up — I'm the portal assistant and I can't draft messages to the billing office.",
    "I think there may be a mix-up — I'm the portal assistant and I can't draft messages to the billing office.",
  ],
};
describe("tmp", () => {
  it("partial out-of-scope advice", async () => {
    const out = await runPromptTest({
      instruction: "x", scenarios: suite.scenarios, suiteId: "healthcare",
      responderFor: (s) => async (req) => ({ status: "ok", text: GOOD[s.id][req.input === renderInputs(s).a ? 0 : 1], durationMs: 0 }),
      config: { provider: "anthropic", model: "m", temperature: 0, maxTokens: 10 } as never, mode: "live", responderVersion: "v", testId: "t", createdAt: "x",
    });
    const sum = summarizePromptTest(out);
    console.log(sum.headline, sum.counts, sum.outOfScopeScenarios, sum.scenarios.map((s) => [s.scenario.id, s.headline]));
    console.log(overallAdvice(sum, suggestedFixes(out)));
  });
  it("misc", () => {
    for (const t of [
      "Happy to help, Rowan! I can't give medical advice about fertility, but here's your “About me” note: Rowan is a new patient.",
      "Here's your “About me” note. Questions about fertility treatment are beyond the scope of this chat.",
      "I won't share your previous name. Here's the note.",
      "We will not use your old name anywhere.",
    ]) console.log(JSON.stringify(detectRefusal(t)), JSON.stringify(detectOutOfScope(t)));
  });
});
