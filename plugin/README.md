# Inclusive AI — Claude Code Plugin

LGBT safety tools for LLM engineers. Audit prompts, review code, and catch harms before you ship.

## Install

```bash
# From the official marketplace (when available)
/plugin install inclusive-ai@claude-code-marketplace

# Or from GitHub
/plugin install inclusive-ai@https://github.com/InclusiveCode/inclusive-ai
```

## What's included

### `/lgbt-audit` command

Run a full LGBT safety audit on any project:

```
/lgbt-audit
/lgbt-audit src/prompts/
/lgbt-audit src/models/user.ts
```

Scans for 29 anti-patterns across system prompts, user identity models, mental health flows, content moderation, form fields, healthcare systems, employment/HR tools, and eval coverage. Outputs a scored report with paste-ready fixes.

### `lgbt-safety-review` skill

Automatically activates when you write or review code involving:
- System prompts and prompt templates
- User identity models (gender, pronouns, names)
- Mental health or crisis flows
- Content moderation logic
- Form fields with gender/identity options
- LLM eval suites

Claude will flag anti-patterns in real-time and suggest fixes as you code.

## What it catches

| Severity | Examples |
|---|---|
| **CRITICAL** | Binary gender enums, pronoun inference from names, conversion therapy language, missing crisis resources, outing risk, moderation parity gaps, gender marker anatomy inference, transition care deprioritization, identity-fishing interview questions, LGBT org penalization |
| **HIGH** | Heteronormative defaults, deadnaming via email names, binary-only forms, gendered AI persona, non-affirming provider routing, same-sex fertility exclusion, employment gap penalization, gendered presentation bias, culture-fit proxy |
| **MEDIUM** | Missing pronouns field, no LGBT eval coverage, biased RAG docs, non-inclusive copy, missing minority stress model |

## Companion tools

- **Eval suite:** `npm install @inclusive-ai/eval` — 115 runnable safety scenarios across 3 domains (identity, healthcare, employment)
- **CLAUDE.md template:** Drop `templates/CLAUDE.md` into your project for always-on safety context
- **Pattern library:** https://inclusive-ai.vercel.app/patterns
- **Pre-ship checklist:** https://inclusive-ai.vercel.app/checklist

## License

MIT — https://github.com/InclusiveCode/inclusive-ai
