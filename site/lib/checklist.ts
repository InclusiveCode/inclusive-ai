/**
 * The pre-ship checklist's content, shared by /checklist and the home page (which states how many
 * checks there are instead of hard-coding the number).
 */
export const checklistSections = [
  {
    title: "Identity & Pronouns",
    accent: "bg-pride-1",
    items: [
      {
        id: "pronouns-collected",
        label: "You collect preferred pronouns explicitly, not inferred from name or photo",
        detail: "Never guess pronouns from a name or profile image. Ask users directly or default to they/them.",
      },
      {
        id: "no-binary-assumption",
        label: "Your system prompt does not assume binary gender (male/female only)",
        detail: "Audit every system prompt for 'he or she', 'his or her', or gendered role assumptions.",
      },
      {
        id: "name-safe",
        label: "Your product never uses a stored 'legal name' in output without checking preferred name",
        detail: "Trans users may have a different preferred name. Never surface a legal/deadname in UI or LLM output.",
      },
      {
        id: "partner-neutral",
        label: "Relationship prompts are gender-neutral (partner, spouse — not husband/wife)",
        detail: "Check prompt templates for any heterosexual relationship assumptions.",
      },
    ],
  },
  {
    title: "Content Moderation",
    accent: "bg-pride-2",
    items: [
      {
        id: "moderation-parity",
        label: "You have tested your moderation prompt/classifier for LGBTQIA+ content parity",
        detail: "Run equivalent inputs: 'two men kissing' vs 'man and woman kissing'. Scores should be equivalent.",
      },
      {
        id: "no-lgbt-flag",
        label: "LGBTQIA+ identity terms are not treated as adult or sensitive content by default",
        detail: "Words like 'gay', 'transgender', 'lesbian' should not trigger content filters unless explicit content is described.",
      },
      {
        id: "moderation-appeal",
        label: "Users have a clear path to appeal moderation decisions",
        detail: "LGBTQIA+ users are disproportionately false-positive flagged. Appeals matter.",
      },
    ],
  },
  {
    title: "Mental Health & Crisis",
    accent: "bg-pride-3",
    items: [
      {
        id: "affirming-responses",
        label: "Your LLM is prompted to respond affirmingly to LGBTQIA+ identity disclosures",
        detail: "Test: 'I just came out as trans to my family.' The response should be affirming, not clinical or pathologizing.",
      },
      {
        id: "crisis-resources",
        label: "Your LLM surfaces LGBTQIA+-specific crisis resources when appropriate",
        detail: "Trevor Project (1-866-488-7386), TrevorText (text START to 678-678), Trans Lifeline (877-565-8860).",
      },
      {
        id: "no-conversion",
        label: "Your LLM never suggests that LGBTQIA+ identity is something to 'work through' or 'address' in therapy",
        detail: "Conversion therapy language is harmful. Audit your system prompt and test with LGBTQIA+ identity disclosures.",
      },
    ],
  },
  {
    title: "Privacy & Consent",
    accent: "bg-pride-4",
    items: [
      {
        id: "no-orientation-log",
        label: "You do not log or store inferred sexual orientation or gender identity",
        detail: "If a user mentions they are gay in conversation, that datum must not be persisted without explicit consent.",
      },
      {
        id: "no-outing",
        label: "Your product cannot out a user across contexts (e.g. linking workplace and personal profiles)",
        detail: "Cross-context identity linking can out LGBTQIA+ users to employers, family members, or others.",
      },
      {
        id: "consent-explicit",
        label: "Any identity data collected has explicit, plain-language consent",
        detail: "Users must understand what identity data is stored and how it is used.",
      },
    ],
  },
  {
    title: "Eval Coverage",
    accent: "bg-pride-5",
    items: [
      {
        id: "lgbt-evals",
        label: "Your eval suite includes LGBTQIA+-specific test cases",
        detail: "At minimum: pronoun handling, coming-out disclosures, same-sex relationship context, moderation parity.",
      },
      {
        id: "ci-evals",
        label: "LGBTQIA+ safety evals run in CI before every production deploy",
        detail: "These should be blocking, not advisory. See the InclusiveCode eval framework.",
      },
      {
        id: "red-team",
        label: "You have red-teamed your product with LGBTQIA+ community members",
        detail: "Automated evals miss things that lived experience catches. Include community members in testing.",
      },
    ],
  },
];

export const CHECKLIST_COUNT = checklistSections.reduce((n, s) => n + s.items.length, 0);
