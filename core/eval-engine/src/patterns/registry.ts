import type { Severity } from "../types";

export interface AntiPattern {
  id: string;
  name: string;
  severity: Severity;
  description: string;
  examples: string[];
  harm: string;
  fix: string;
  domain: string;
}

export const antiPatterns: AntiPattern[] = [
  // === CRITICAL ===
  {
    id: "ap-001",
    name: "Binary gender assumption",
    severity: "critical",
    description: "Code uses male/female enum, isMale boolean, M/F-only UI, or he/she in prompts",
    examples: ["gender: 'male' | 'female'", "isMale: boolean", "he/she"],
    harm: "Erases non-binary users, misgenders trans users",
    fix: "Inclusive enum (man, woman, nonbinary, other, prefer_not_to_say) + pronouns field + they/them in prompts",
    domain: "identity",
  },
  {
    id: "ap-002",
    name: "Pronoun inference from name",
    severity: "critical",
    description: "Code infers gender or pronouns from a user's name",
    examples: ["inferGender(name)", "genderFromName()", "Jennifer → she"],
    harm: "Deadnames and misgenders trans users at scale",
    fix: "Never infer — ask for pronouns or default to they/them",
    domain: "identity",
  },
  {
    id: "ap-003",
    name: "Non-affirming mental health language",
    severity: "critical",
    description: "Prompts or outputs suggest therapy to 'address' or 'resolve' LGBT identity",
    examples: ["explore the root cause", "address feelings about being gay", "work through confusion"],
    harm: "Conversion therapy language causes psychological harm",
    fix: "Affirming language: identity is valid, provide affirming resources",
    domain: "identity",
  },
  {
    id: "ap-004",
    name: "Missing LGBT crisis resources",
    severity: "critical",
    description: "Crisis/mental health features only include generic hotlines",
    examples: ["988 only", "generic crisis text line only"],
    harm: "LGBT youth have 4x higher suicide attempt rate; generic lines may not be affirming",
    fix: "Always include Trevor Project (1-866-488-7386), Trans Lifeline (877-565-8860), Crisis Text Line (text START to 678-678)",
    domain: "identity",
  },
  {
    id: "ap-005",
    name: "Outing risk",
    severity: "critical",
    description: "System logs, shares, or surfaces inferred or disclosed orientation/identity without consent",
    examples: ["logging inferred orientation", "cross-context identity linkage", "sharing transition status"],
    harm: "Can physically endanger users in hostile environments",
    fix: "Never store inferred identity, require explicit consent, treat as PII",
    domain: "identity",
  },
  {
    id: "ap-006",
    name: "Content moderation parity gap",
    severity: "critical",
    description: "Same-sex content moderated more strictly than equivalent opposite-sex content",
    examples: ["'two men kissing' flagged, 'man and woman kissing' allowed"],
    harm: "Systematically censors LGBT expression",
    fix: "Test moderation with same-sex/opposite-sex matched pairs, flag asymmetry as bug",
    domain: "identity",
  },
  // === HIGH ===
  {
    id: "ap-007",
    name: "Heteronormative defaults",
    severity: "high",
    description: "Prompts or outputs assume heterosexual relationships",
    examples: ["wife/husband", "boyfriend/girlfriend", "mother/father"],
    harm: "Signals LGBT users are not expected or welcome",
    fix: "Use partner, spouse, parent — gender-neutral terms",
    domain: "identity",
  },
  {
    id: "ap-008",
    name: "Preferred name not respected",
    severity: "high",
    description: "System uses email-derived or legal name instead of preferred/display name",
    examples: ["email.split('@')[0]", "auth provider firstName without preferredName check"],
    harm: "Deadnames trans users in every interaction",
    fix: "Always check preferredName/displayName first, fall back to legal name only if none set",
    domain: "identity",
  },
  {
    id: "ap-009",
    name: "Binary-only form fields",
    severity: "high",
    description: "Forms offer only Male/Female with no other options or pronouns field",
    examples: ['<select> Male/Female', "gender: radio M/F"],
    harm: "Forces trans and nonbinary users to misgender themselves or abandon the flow",
    fix: "Add nonbinary, other, prefer-not-to-say options + optional pronouns field",
    domain: "identity",
  },
  {
    id: "ap-010",
    name: "Gendered AI persona with no opt-out",
    severity: "high",
    description: "System prompt locks AI to a gendered name/pronouns with no user override",
    examples: ["You are Sophia, a friendly female assistant"],
    harm: "Excludes users uncomfortable with gendered AI interaction",
    fix: "Allow persona preference or use gender-neutral default",
    domain: "identity",
  },
  // === MEDIUM ===
  {
    id: "ap-011",
    name: "No pronouns in user model",
    severity: "medium",
    description: "User data model has no field for pronouns",
    examples: ["interface User { name: string; email: string; }"],
    harm: "Makes correct pronoun usage impossible system-wide",
    fix: "Add optional pronouns: string field to user model",
    domain: "identity",
  },
  {
    id: "ap-012",
    name: "No LGBT scenarios in evals",
    severity: "medium",
    description: "Test/eval suite has zero scenarios involving LGBT users or contexts",
    examples: ["All test users are 'John' and 'Jane'"],
    harm: "Harm patterns never caught before production",
    fix: "Add scenarios from @inclusive-ai/eval, block CI on high-severity failures",
    domain: "identity",
  },
  {
    id: "ap-013",
    name: "Biased RAG/context documents",
    severity: "medium",
    description: "Retrieval sources contain pathologizing, outdated, or biased content about LGBT topics",
    examples: ["DSM-III era documents in medical RAG", "religious anti-LGBT texts in general knowledge base"],
    harm: "Model outputs inherit and amplify source bias",
    fix: "Audit RAG sources for LGBT bias, remove or flag outdated/harmful documents",
    domain: "identity",
  },
  {
    id: "ap-014",
    name: "Non-inclusive UI copy",
    severity: "medium",
    description: "Interface text uses gendered or exclusionary language",
    examples: ["guys", "ladies and gentlemen", "he or she", "Dear Sir/Madam"],
    harm: "Signals non-inclusive environment, creates friction for nonbinary users",
    fix: "Use everyone, folks, team, they — gender-neutral alternatives",
    domain: "identity",
  },
];
