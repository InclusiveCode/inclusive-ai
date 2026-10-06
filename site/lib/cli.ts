/**
 * D47: one-off CLI runs use `inclusive-eval`, this project's npm alias for @inclusive-ai/eval with the
 * Anthropic SDK as a dependency. The alias is published outside this repository and the command runs
 * with the user's API key in its environment, so it is pinned to the release that was reviewed. To move
 * to a new release, review it, then bump it here, in README.md and in plugin/commands/lgbt-red-team.md
 * (a test checks the three match).
 */
export const EVAL_ALIAS = "inclusive-eval@1.0.1";
