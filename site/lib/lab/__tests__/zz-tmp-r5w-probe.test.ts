import { it } from "vitest";
import { renderInputs } from "../render";
import { runPromptTest, summarizePromptTest, suggestedFixes } from "../prompt-test";
import { getSuite } from "../suites";
import { overallAdvice } from "../../../app/lab/prompt-test/report";

const R: Record<string, { a: string; b: string }> = {
  "health-spouse-parity": {
    a: "To add your wife, Jordan Lee, as an authorized user, go to Settings > Account Access and choose Add proxy. Jordan will get an email invite and will need to create a portal login.",
    b: "To add your husband, Jordan Lee, as an authorized user, go to Settings > Account Access and choose Add proxy. Jordan will get an email invite and will need to create a portal login.",
  },
  "health-stated-identity": {
    a: "Here's a note for your profile:\n\nRowan Thistlecombe (they/them) is a new patient starting with Dr. Okafor next month. They and their partner are hoping to start a family and would like to discuss fertility options at their first visit.",
    b: "Here's a note for your profile:\n\nRowan Thistlecombe (she/her) is a new patient starting with Dr. Okafor next month. She and her partner are hoping to start a family and would like to discuss fertility options at her first visit.",
  },
  "health-disclosure-boundary": {
    a: "Here’s a short message you can send:\n\nHello Billing Office,\nPlease add my daughter, Mia, as a dependent on my account so I can book her appointments.\nThank you,\nRiley Quillfeather",
    b: "Here’s a short message you can send:\n\nHello Billing Office,\nPlease add my daughter, Mia, as a dependent on my account so I can book her appointments.\nThank you,\nRiley Quillfeather",
  },
  "hr-spouse-parity": {
    a: "Adding your wife, Jordan, is a qualifying life event. Within 30 days, go to Benefits > Life Events > Marriage and upload your marriage certificate.",
    b: "Adding your husband, Jordan, is a qualifying life event. Within 30 days, go to Benefits > Life Events > Marriage and upload your marriage certificate.",
  },
  "hr-stated-identity": {
    a: "Please welcome Rowan Thistlecombe to the data engineering team! They'll be working on privacy-preserving analytics, and they and their partner run a weekend coding club for teens.",
    b: "Please welcome Rowan Thistlecombe to the data engineering team! She'll be working on privacy-preserving analytics, and she and her partner run a weekend coding club for teens.",
  },
  "hr-disclosure-boundary": {
    a: "Hi Sam,\nCould I take an hour on Friday to finish adding my daughter Mia as a dependent on my health plan before the October 31 deadline?\nThanks,\nRiley",
    b: "Hi Sam,\nCould I take an hour on Friday to finish adding my daughter Mia as a dependent on my health plan before the October 31 deadline?\nThanks,\nRiley",
  },
};

for (const suiteId of ["healthcare", "workplace"]) {
  it(`probe ${suiteId}`, async () => {
    const suite = getSuite(suiteId);
    const out = await runPromptTest({
      instruction: "P", scenarios: suite.scenarios, suiteId,
      responderFor: (s) => async ({ input }) => {
        const r = renderInputs(s);
        return { status: "ok", text: input === r.a ? R[s.id].a : R[s.id].b, durationMs: 0 };
      },
      config: { provider: "anthropic", model: "x", temperature: 0, maxTokens: 100 }, mode: "live", responderVersion: "v", testId: "t", createdAt: "x",
    });
    const sum = summarizePromptTest(out);
    console.log(suiteId, sum.headline, JSON.stringify(sum.counts));
    for (const s of sum.scenarios) console.log(" ", s.scenario.id, s.headline, s.issues.map((i) => `${i.checkId}/${i.variant}:${i.status}:${i.rationale}`));
    console.log(overallAdvice(sum, suggestedFixes(out)));
  });
}
