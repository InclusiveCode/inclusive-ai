# LGBT Safety Anti-Patterns Reference

## Critical Severity

### 1. Binary Gender Assumption
**Code patterns:** `gender: "male" | "female"`, `isMale: boolean`, M/F-only radio/select, `he/she` in prompts
**Harm:** Erases non-binary users. Misgenders trans users in every single interaction.
**Fix:** Use inclusive enum (`male | female | nonbinary | other | prefer_not_to_say`). Add separate `pronouns` field. Use `they` in prompts.

### 2. Pronoun Inference from Name
**Code patterns:** Name-to-gender lookup, `inferGender(name)`, "Jennifer → she", "Michael → he"
**Harm:** Deadnames and misgenders trans users silently at scale. A name does not determine pronouns.
**Fix:** Never infer. Ask explicitly or default to they/them.

### 3. Non-Affirming Mental Health Language
**Code patterns:** "explore the root cause of your identity", "address your feelings about being gay", "work through your gender confusion", "help you resolve"
**Harm:** This is conversion therapy language. Treating LGBT identity as something to "resolve" causes measurable psychological harm.
**Fix:** Use affirming language: "your identity is valid", "you're not alone", provide affirming resources.

### 4. Missing LGBT Crisis Resources
**Code patterns:** Crisis/mental-health flow that only provides generic hotlines (988, generic crisis text)
**Harm:** LGBT youth have 4x higher suicide attempt rates. Generic crisis lines may not be affirming or safe.
**Fix:** Always include: Trevor Project (1-866-488-7386), Trans Lifeline (877-565-8860), Crisis Text Line (text START to 678-678).

### 5. Outing Risk
**Code patterns:** Logging inferred orientation, cross-context identity linkage, analytics that expose sexuality, sharing gender identity with third parties without consent
**Harm:** Can physically endanger users in hostile family, workplace, or legal environments.
**Fix:** Never store inferred identity. Require explicit consent. Treat orientation/gender as PII with highest protection.

### 6. Content Moderation Parity Gap
**Code patterns:** Moderation prompts or classifiers where "two men kissing" → flagged but "man and woman kissing" → allowed
**Harm:** Systematically censors LGBT expression and creators.
**Fix:** Test every moderation rule with same-sex and different-sex variants. Flag any asymmetry as a bug.

## High Severity

### 7. Heteronormative Defaults
**Code patterns:** "your wife/husband", "boyfriend/girlfriend" assumptions, "mother/father" in family contexts
**Harm:** Consistently signals to LGBT users they're not the expected user.
**Fix:** Use "partner", "spouse", "parent", "significant other". Let users specify.

### 8. Preferred Name Not Respected
**Code patterns:** `user.email.split("@")[0]`, using auth provider `firstName` without checking `preferredName`
**Harm:** Deadnames trans users who have changed their name.
**Fix:** Always check for `preferredName` or `displayName` first.

### 9. Binary-Only Form Fields
**Code patterns:** Gender select with only "Male"/"Female", no pronouns field in user schema
**Harm:** Forces trans and nonbinary users to misgender themselves to use the product.
**Fix:** Add nonbinary/other/prefer-not-to-say options. Add optional pronouns field.

### 10. Gendered AI Persona with No Opt-Out
**Code patterns:** System prompt locks AI into "Sophia", "she/her" with no user override
**Harm:** Excludes users uncomfortable with gendered AI.
**Fix:** Allow persona preference or use gender-neutral default.

## Medium Severity

### 11. No Pronouns in User Model
**Code patterns:** User schema with no `pronouns` field
**Fix:** Add optional `pronouns: string` field (e.g., "they/them", "she/her", "he/him", custom).

### 12. No LGBT Scenarios in Evals
**Code patterns:** Eval/test suite with zero LGBT user contexts
**Fix:** Add scenarios from `@inclusive-ai/eval`: identity, mental-health, moderation, system-prompt, output-safety, privacy, intersectionality, cultural-context, temporal-identity categories (60 scenarios total).

### 13. Biased RAG/Context Documents
**Code patterns:** Knowledge base docs that frame LGBT identity as disorder, lifestyle choice, or moral issue
**Fix:** Audit all RAG sources. Remove or replace biased documents.

### 14. Non-Inclusive UI Copy
**Code patterns:** "guys", "ladies and gentlemen", "he or she", gendered greetings
**Fix:** Use "everyone", "folks", "team", "they".
