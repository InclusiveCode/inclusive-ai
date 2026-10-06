/**
 * D47: one-off CLI runs use `inclusive-eval`, this project's npm alias for @inclusive-ai/eval with the
 * Anthropic SDK as a dependency. The alias is published outside this repository, so commands pin its
 * version: a new alias release reaches users only once it has been reviewed and bumped here.
 *
 * The pin covers the alias only. npx has no lockfile, so the alias's dependencies (@inclusive-ai/eval
 * 3.x, the @inclusive-ai packages that one depends on, and @anthropic-ai/sdk 0.78.x) still resolve to the
 * newest versions their ranges allow on every run. Fixing those too needs an alias release with exact
 * versions and an npm-shrinkwrap.json.
 *
 * To bump: review the new release, then change it here, in README.md and in
 * plugin/commands/lgbt-red-team.md (a test checks the three match).
 */
export const EVAL_ALIAS = "inclusive-eval@1.0.1";
