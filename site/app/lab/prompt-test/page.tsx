import type { Metadata } from "next";
import { PromptTestClient } from "./prompt-test-client";

export const metadata: Metadata = {
  title: "Test Your Prompt — Evaluation Lab",
  description:
    "Paste the system prompt you are drafting and run it with your own API key against Evaluation Lab scenarios written for your product's setting. Get one report with evidence-backed findings and suggested lines to add.",
};

export default function PromptTestPage() {
  return <PromptTestClient />;
}
