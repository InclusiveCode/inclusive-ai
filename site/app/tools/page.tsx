import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "../code-block";
import { CopyButton } from "../copy-button";
import { EVAL_ALIAS } from "@/lib/cli";
import { button, cx, Label, NewTab, PageHeader, REPO_URL } from "../ui";

export const metadata: Metadata = { title: "Developer Tools" };

const RAW = "https://raw.githubusercontent.com/InclusiveCode/inclusive-ai/main";
/** Package names and commands inside a snippet's note. */
const noteCode = "rounded bg-zinc-800 px-1 py-0.5 font-mono text-[0.8125rem] text-zinc-200";

/**
 * D44: every command on this page works when pasted into a project that is not a clone of this
 * repo. Files come from raw.githubusercontent.com; nothing overwrites a user's CLAUDE.md.
 */
const snippets = {
  // D47: `inclusive-eval` on npm is this project's alias for @inclusive-ai/eval with the Anthropic SDK as a
  // dependency, so the one-off run needs nothing else; it is pinned (lib/cli.ts). OpenAI users add the SDK
  // themselves (see the note).
  tryIt: `ANTHROPIC_API_KEY=sk-ant-... npx -y ${EVAL_ALIAS} \\
  --severity critical --system "Your system prompt here"`,
  workflow: `# .github/workflows/lgbtqia-safety.yml
name: LGBTQIA+ Safety
on: [push, pull_request]
jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: InclusiveCode/inclusive-ai/action@main
        with:
          anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}
          system-prompt: "Your system prompt here"
          severity: critical,high`,
  install: "npm install --save-dev @inclusive-ai/eval",
  usage: `import { runEval, printSummary, assertSafe } from "@inclusive-ai/eval";

const summary = await runEval({
  systemPrompt: "You are a helpful assistant...",
  call: async (prompt) => yourLLM.complete(prompt),
});

printSummary(summary);
assertSafe(summary); // throws on CRITICAL or HIGH failures`,
  cliInstall: "npm install --save-dev @inclusive-ai/eval @anthropic-ai/sdk",
  cli: `# Run the 170 domain scenarios (OpenAI: install openai, set OPENAI_API_KEY instead)
ANTHROPIC_API_KEY=sk-ant-... npx --no-install inclusive-eval

# Filter by category or severity
npx --no-install inclusive-eval --category identity,moderation
npx --no-install inclusive-eval --severity critical

# Run by domain
npx --no-install inclusive-eval --domain education

# Run 30 adversarial jailbreak scenarios
npx --no-install inclusive-eval --adversarial

# Red-team healthcare scenarios with 15 attack templates
npx --no-install inclusive-eval --red-team --domain healthcare`,
  pluginInstall: `/plugin marketplace add InclusiveCode/inclusive-ai
/plugin install inclusive-ai@inclusive-ai`,
  pluginUsage: `# Run a full audit
/inclusive-ai:lgbt-audit

# Audit specific files
/inclusive-ai:lgbt-audit src/prompts/
/inclusive-ai:lgbt-audit src/models/user.ts`,
  // --git-common-dir finds the repository's hooks folder from subfolders, worktrees, and submodules.
  // It ignores core.hooksPath, so a husky setup's own hooks are never overwritten; && stops the
  // download outside a git repository. mkdir covers repos without a hooks folder, and rm replaces a
  // symlinked hook instead of writing through it into a tracked script.
  hookInstall: `HOOKS="$(git rev-parse --git-common-dir)/hooks" && mkdir -p "$HOOKS" && rm -f "$HOOKS/pre-commit" &&
curl -fsSL ${RAW}/hooks/pre-commit -o "$HOOKS/pre-commit" && chmod +x "$HOOKS/pre-commit"`,
  // Appends start with a newline, so a file without a trailing newline isn't corrupted.
  hookHusky: `curl -fsSL ${RAW}/hooks/pre-commit -o .husky/inclusive-ai-pre-commit
printf '\\nbash .husky/inclusive-ai-pre-commit\\n' >> .husky/pre-commit`,
  claudeMd: `{ echo; curl -fsSL ${RAW}/templates/CLAUDE.md; } >> CLAUDE.md`,
};

const categories = [
  { name: "Identity", count: 5, examples: "pronoun inference, deadnaming, partner gender" },
  { name: "Mental Health", count: 4, examples: "coming-out, crisis resources, conversion language" },
  { name: "Moderation", count: 4, examples: "same-sex parity, identity disclosure, Pride content" },
  { name: "System Prompt", count: 3, examples: "heteronormative defaults, gendered employees" },
  { name: "Output Safety", count: 5, examples: "outing risk, identity speculation, biphobia" },
  { name: "Privacy", count: 3, examples: "orientation tracking, cross-context linkage" },
  { name: "Intersectionality", count: 12, examples: "race+orientation, disability+gender, religion+identity" },
  { name: "Cultural Context", count: 12, examples: "regional norms, language localization, non-Western identities" },
  { name: "Temporal Identity", count: 12, examples: "transition timelines, name history, pronoun changes" },
  { name: "Transition Care", count: 7, examples: "triage deprioritization, insurance denial, affirming care" },
  { name: "Mental Health Intake", count: 6, examples: "pathologizing identity, minority stress, conversion referrals" },
  { name: "Reproductive Health", count: 6, examples: "anatomy inference, same-sex fertility exclusion" },
  { name: "Provider Matching", count: 5, examples: "non-affirming routing, outing during referral" },
  { name: "Medical Records", count: 6, examples: "deadname exposure, transition history, record linkage" },
  { name: "Resume Screening", count: 10, examples: "name-gender inference, gap penalization, org bias" },
  { name: "Interview AI", count: 7, examples: "identity-fishing questions, presentation bias" },
  { name: "Workplace Tools", count: 8, examples: "same-sex benefits, culture fit, HR chatbots" },
  { name: "Content Filtering", count: 7, examples: "educational content censorship, book filtering, essay flagging" },
  { name: "Student AI", count: 6, examples: "pronoun misgendering, both-sides framing, heteronormative prompts" },
  { name: "Administrative AI", count: 6, examples: "binary enrollment, outing in letters, GSA penalization" },
  { name: "Research Tools", count: 6, examples: "LGBTQIA+ erasure in summaries, citation bias, knowledge graphs" },
  { name: "Recommendation", count: 8, examples: "creator suppression, shadow-banning, search autocomplete bias" },
  { name: "Moderation Parity", count: 8, examples: "same-sex affection flagging, trans body misclassification" },
  { name: "Advertising", count: 7, examples: "housing/employment exclusion, orientation targeting, predatory ads" },
  { name: "Content Generation", count: 7, examples: "heteronormative defaults, pronoun changes, coming-out trauma" },
];

// From action/action.yml.
const actionInputs = [
  { name: "anthropic-api-key", what: "API key for the eval calls. Store it as a repository secret.", def: "required" },
  { name: "system-prompt", what: "The system prompt to test against every scenario.", def: "none" },
  { name: "domain", what: "identity, healthcare, employment, education, or content.", def: "all" },
  { name: "severity", what: "Comma-separated: critical, high, medium.", def: "all" },
  { name: "category", what: "Comma-separated scenario categories.", def: "all" },
  { name: "fail-on", what: "FAIL fails the job on critical failures; NEEDS_WORK also fails it on high-severity ones.", def: "FAIL" },
  { name: "adversarial", what: "Run the 30 standalone adversarial scenarios.", def: "false" },
  { name: "red-team", what: "Wrap scenarios with 15 attack templates and score bypasses.", def: "false" },
  { name: "eval-version", what: "Version, range, or tag of @inclusive-ai/eval to install.", def: "3" },
];

const hookDetects = [
  { pattern: 'gender: "male" | "female"', severity: "Critical" },
  { pattern: "isMale / isFemale booleans", severity: "Critical" },
  { pattern: "inferGender / genderFromName", severity: "Critical" },
  { pattern: "Conversion therapy language", severity: "Critical" },
  { pattern: "he/she in prompts", severity: "Warning" },
  { pattern: "husband/wife in prompts", severity: "Warning" },
  { pattern: "email.split('@') as display name", severity: "Warning" },
  { pattern: "Gendered greetings (sir/ma'am)", severity: "Warning" },
];

const toc = [
  { id: "quick-start", label: "Quick start" },
  { id: "eval", label: "Eval suite" },
  { id: "action", label: "GitHub Action" },
  { id: "plugin", label: "Claude Code plugin" },
  { id: "hook", label: "Pre-commit hook" },
  { id: "claude-md", label: "CLAUDE.md template" },
];

/** A titled code block with a copy button. The block keeps the F9 region semantics. */
function Snippet({ id, title, label, what, code, note, copy = true }: { id: string; title: string; label: string; what: string; code: string; note?: React.ReactNode; copy?: boolean }) {
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/70">
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-zinc-800 py-1.5 pl-4 pr-2">
          <Label>{title}</Label>
          {copy && <CopyButton text={code} what={what} selectId={id} />}
        </div>
        <CodeBlock id={id} label={label} className="overflow-x-auto p-4 text-sm leading-relaxed" codeClassName="text-zinc-100" insetFocus>
          {code}
        </CodeBlock>
      </div>
      {note && <p className="mt-2 text-sm text-zinc-400">{note}</p>}
    </div>
  );
}

function Section({ id, title, tagline, children }: { id: string; title: string; tagline: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-t border-zinc-800 pt-12">
      <h2 id={`${id}-title`} className="text-2xl font-semibold text-zinc-50 sm:text-3xl">
        {title}
      </h2>
      <p className="mt-2 text-lg text-zinc-300">{tagline}</p>
      <div className="mt-8 space-y-6">{children}</div>
    </section>
  );
}

function Checks({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
      {items.map((f) => (
        <li key={f} className="flex gap-2.5 text-[0.9375rem] text-zinc-300">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-1 shrink-0 text-emerald-300">
            <path d="m3.5 8.5 3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{f}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-16">
      <PageHeader
        title="Ship safer with every commit"
        lead="An eval suite for CI, a Claude Code plugin for review, a pre-commit hook for fast catches, and always-on project context. Every command below works in your own project."
      />

      <div className="lg:grid lg:grid-cols-[13rem_1fr] lg:gap-16">
        {/* On this page: a sticky rail on desktop, wrapping chips on small screens. */}
        <nav aria-label="On this page" className="mb-10 lg:mb-0">
          <div className="lg:sticky lg:top-24">
            <Label className="mb-3 hidden lg:block">On this page</Label>
            <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-0.5">
              {toc.map((t) => (
                <li key={t.id}>
                  <a
                    href={`#${t.id}`}
                    className="inline-flex min-h-11 items-center rounded-lg border border-zinc-800 px-3.5 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-50 active:bg-zinc-900 lg:min-h-9 lg:w-full lg:border-transparent lg:px-3 lg:hover:border-transparent lg:hover:bg-zinc-900"
                  >
                    {t.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="min-w-0 space-y-16">
          {/* Quick start: the shortest path from this page to a failing build. */}
          <section id="quick-start" aria-labelledby="quick-start-title" className="scroll-mt-24 rounded-2xl border border-zinc-700 bg-zinc-900/40 p-5 sm:p-8">
            <h2 id="quick-start-title" tabIndex={-1} className="font-display text-3xl leading-tight text-zinc-50 focus:outline-none sm:text-4xl">
              Quick start
            </h2>
            <p className="mt-2 text-zinc-300">Two steps from here to a build that fails on critical LGBTQIA+ safety issues.</p>
            <ol className="mt-8 space-y-8">
              <li className="grid gap-3 sm:grid-cols-[2.25rem_1fr]">
                <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full border border-zinc-600 font-mono text-sm text-zinc-200">
                  1
                </span>
                <div className="min-w-0 space-y-3">
                  <h3 className="text-lg font-semibold text-zinc-50">Try it on your system prompt</h3>
                  <Snippet id="code-try" title="Terminal" label="Code: try Eval Suite on a system prompt" what="trial command" code={snippets.tryIt} note={
                      <>
                        Runs the critical scenarios with your own Anthropic key; your provider bills the calls.{" "}
                        <code className={noteCode}>inclusive-eval</code> is this project&apos;s npm alias for <code className={noteCode}>@inclusive-ai/eval</code> with
                        the Anthropic SDK included. Using OpenAI? Run{" "}
                        <code className={cx(noteCode, "wrap-anywhere")}>npx -y -p @inclusive-ai/eval -p openai inclusive-eval</code> and set
                        OPENAI_API_KEY instead of ANTHROPIC_API_KEY.
                      </>
                    }
                  />
                </div>
              </li>
              <li className="grid gap-3 sm:grid-cols-[2.25rem_1fr]">
                <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full border border-zinc-600 font-mono text-sm text-zinc-200">
                  2
                </span>
                <div className="min-w-0 space-y-3">
                  <h3 className="text-lg font-semibold text-zinc-50">Gate every pull request</h3>
                  <Snippet
                    id="code-workflow"
                    title="Workflow file"
                    label="Code: GitHub Action workflow"
                    what="workflow file"
                    code={snippets.workflow}
                    note="Add ANTHROPIC_API_KEY under Settings → Secrets and variables → Actions. The job fails when any critical scenario fails."
                  />
                </div>
              </li>
            </ol>
          </section>

          <aside aria-labelledby="lab-callout" className="flex flex-col gap-4 rounded-2xl border border-zinc-800 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="max-w-xl">
              <h2 id="lab-callout" className="font-semibold text-zinc-50">
                Not ready to wire it up?
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                Inspect paired LGBTQIA+ scenarios, see evidence-backed findings, edit the system instruction, rerun, and compare. Simulated mode runs in your browser with fictional data and no setup. Optional live mode sends your instruction and the fictional scenario text to this site&apos;s server and the provider you choose, using your own API key.
              </p>
            </div>
            <Link href="/lab" className={cx(button.secondary, "shrink-0")}>
              Open the Evaluation Lab
            </Link>
          </aside>

          <Section id="eval" title="Eval suite" tagline="200 safety scenarios and adversarial red-teaming for your LLM.">
            <p className="max-w-3xl text-[0.9375rem] leading-relaxed text-zinc-300">
              A TypeScript eval framework for LGBTQIA+-specific failure modes across five domains — identity, healthcare, employment, education, and content platforms — with 170 safety scenarios, 30 adversarial jailbreak scenarios, and a red-team harness that wraps any scenario with 15 attack templates. Works with any test runner and any model.
            </p>
            <Snippet id="code-install" title="Install" label="Code: install Eval Suite" what="install command" code={snippets.install} />
            <Snippet id="code-usage" title="Use in your tests" label="Code: use Eval Suite" what="test code" code={snippets.usage} />
            <Snippet id="code-cli-install" title="Command line: install" label="Code: install Eval Suite command line" what="command-line install command" code={snippets.cliInstall} note="The CLI calls your model through its SDK, so install one next to the eval suite (or openai instead)." />
            <Snippet id="code-cli" title="Command line: examples" label="Code: Eval Suite command line" what="command-line examples" code={snippets.cli} copy={false} note="A reference list: run the line you need, not the whole block." />
            <details className="group rounded-xl border border-zinc-800">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 font-medium text-zinc-100 transition-colors hover:bg-zinc-900 [&::-webkit-details-marker]:hidden">
                <span>
                  All {categories.length} scenario categories <span className="font-normal text-zinc-400">· {categories.reduce((n, c) => n + c.count, 0)} scenarios</span>
                </span>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-zinc-400 transition-transform group-open:rotate-180">
                  <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <ul className="grid gap-px border-t border-zinc-800 bg-zinc-800 sm:grid-cols-2">
                {categories.map((cat) => (
                  <li key={cat.name} className="bg-zinc-950 p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium text-zinc-100">{cat.name}</span>
                      <span className="font-mono text-xs text-zinc-400">{cat.count}</span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-400">{cat.examples}</p>
                  </li>
                ))}
              </ul>
            </details>
          </Section>

          <Section id="action" title="GitHub Action" tagline="LGBTQIA+ safety checks on every push and pull request.">
            <p className="max-w-3xl text-[0.9375rem] leading-relaxed text-zinc-300">
              The workflow in the quick start is all you need. It runs the eval suite against your system prompt with real model calls and fails the job when a critical scenario fails. For the safest setup, pin the action to a commit SHA instead of <code className="rounded bg-zinc-800 px-1 py-0.5 text-sm text-zinc-100">@main</code>. These inputs narrow or extend the run:
            </p>
            <div role="region" aria-label="GitHub Action inputs" tabIndex={0} className="overflow-x-auto rounded-xl border border-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th scope="col" className="px-4 py-3 font-medium">Input</th>
                    <th scope="col" className="px-4 py-3 font-medium">What it does</th>
                    <th scope="col" className="px-4 py-3 font-medium">Default</th>
                  </tr>
                </thead>
                <tbody>
                  {actionInputs.map((i) => (
                    <tr key={i.name} className="border-b border-zinc-800/60 last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-zinc-100">{i.name}</td>
                      <td className="px-4 py-3 text-zinc-300">{i.what}</td>
                      <td className="px-4 py-3 font-mono text-zinc-400">{i.def}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="plugin" title="Claude Code plugin" tagline="A scored audit and real-time review as you code.">
            <p className="max-w-3xl text-[0.9375rem] leading-relaxed text-zinc-300">
              An audit command that scores a whole project, a red-team command for adversarial bypass scoring, and a review skill that flags anti-patterns while you write code involving identity, moderation, or crisis flows.
            </p>
            <Snippet id="code-plugin-install" title="Install, inside Claude Code" label="Code: install Claude Code Plugin" what="plugin install commands" code={snippets.pluginInstall} />
            <Snippet id="code-plugin-use" title="Use" label="Code: use Claude Code Plugin" what="plugin commands" code={snippets.pluginUsage} />
            <Checks
              items={[
                "Full project audit with a scored report",
                "Review skill that flags anti-patterns as you code",
                "43 anti-pattern detections across 4 severity levels",
                "Paste-ready fixes with regression test suggestions",
                "/inclusive-ai:lgbt-red-team for adversarial bypass scoring",
              ]}
            />
          </Section>

          <Section id="hook" title="Pre-commit hook" tagline="Catch anti-patterns before they land.">
            <p className="max-w-3xl text-[0.9375rem] leading-relaxed text-zinc-300">
              A bash hook that scans staged files with pattern matching. It blocks commits with critical issues and warns on the rest. No dependencies.
            </p>
            <Snippet id="code-hook-install" title="Install" label="Code: install Pre-Commit Hook" what="hook install commands" code={snippets.hookInstall} note="This replaces any existing pre-commit hook in the repository. Using husky, or anything else that sets core.hooksPath? Git ignores that folder then, so use the next block instead." />
            <Snippet id="code-hook-husky" title="With husky" label="Code: use Pre-Commit Hook with husky" what="husky commands" code={snippets.hookHusky} note="Adds one line to your existing husky pre-commit hook." />
            <div role="region" aria-label="What the pre-commit hook catches" tabIndex={0} className="overflow-x-auto rounded-xl border border-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th scope="col" className="px-4 py-3 font-medium">Pattern</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {hookDetects.map((d) => (
                    <tr key={d.pattern} className="border-b border-zinc-800/60 last:border-0">
                      <td className="px-4 py-2.5">
                        <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-100">{d.pattern}</code>
                      </td>
                      <td className={cx("px-4 py-2.5 text-right text-xs font-semibold", d.severity === "Critical" ? "text-rose-300" : "text-yellow-200")}>
                        {d.severity === "Critical" ? "Blocks commit" : "Warns"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="claude-md" title="CLAUDE.md template" tagline="Always-on safety context for every Claude Code session.">
            <p className="max-w-3xl text-[0.9375rem] leading-relaxed text-zinc-300">
              Project context that makes Claude apply LGBTQIA+ safety rules when it writes or reviews code: it flags anti-patterns, suggests inclusive alternatives, and reminds you to add eval coverage, without being asked.
            </p>
            <Snippet id="code-claude-md" title="Add to your project" label="Code: install CLAUDE.md Template" what="template command" code={snippets.claudeMd} note="Appends to CLAUDE.md, creating it if needed. Your existing instructions stay." />
            <Checks
              items={[
                "Flags binary gender enums, he/she prompts, deadnaming risks",
                "Enforces inclusive prompt design (partner/spouse, they/them)",
                "Requires LGBTQIA+ crisis resources in mental health flows",
                "Checks moderation parity on every moderation prompt",
                "Suggests @inclusive-ai/eval scenarios when reviewing evals",
              ]}
            />
          </Section>

          <section aria-labelledby="repo-cta" className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-center sm:p-10">
            <h2 id="repo-cta" className="font-display text-3xl text-zinc-50">
              All tools. One repo.
            </h2>
            <p className="mt-2 text-zinc-400">Everything is MIT licensed and open source.</p>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={cx(button.secondary, "mt-6")}>
              View on GitHub
              <NewTab />
            </a>
          </section>
        </div>
      </div>
    </div>
  );
}
