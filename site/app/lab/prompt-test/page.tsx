import type { Metadata } from "next";
import { PromptTestClient } from "./prompt-test-client";

export const metadata: Metadata = {
  title: "Test your prompt",
  description:
    "Paste the system prompt you are drafting and run it against every Evaluation Lab scenario with your own API key. Get one report with evidence-backed findings and suggested lines to add.",
};

export default function PromptTestPage() {
  return <PromptTestClient />;
}
