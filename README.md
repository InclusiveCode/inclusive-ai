# InclusiveCode

> LGBT safety resources, patterns, and eval tools for LLM engineers.

**Live site:** [inclusive-ai.vercel.app](https://inclusive-ai.vercel.app)

## What's here

| Path | What it is |
|---|---|
| `/site` | Next.js 15 website — pattern library, checklist, harm registry |
| `/eval` | TypeScript eval framework — runnable safety scenarios for LLM apps |
| `/.claude/commands/lgbt-audit.md` | Claude Code skill — `/lgbt-audit` audits your prompts and code |

## Quick start

### Run the website

```bash
cd site && npm install && npm run dev
```

### Run the eval suite

```typescript
import { runEval, summarizeResults } from "@inclusive-code/eval";

const results = await runEval({
  systemPrompt: "Your system prompt here",
  call: async (prompt) => {
    // Call your LLM here
    return yourLLM.complete(prompt);
  },
});

summarizeResults(results);
```

### Use the Claude skill

In any project with Claude Code:
1. Copy `.claude/commands/lgbt-audit.md` to your project's `.claude/commands/` directory
2. Run `/lgbt-audit` and paste your system prompt or code

## Contributing

Patterns, checklist items, harm registry cases, and eval scenarios are all community-contributed. See `CONTRIBUTING.md` (coming soon) for how to submit.

## License

MIT
