import { describe, it, expect } from "vitest";
import { TextAdapter } from "../../src/adapters/text";
import type { TextEvalScenario } from "../../src/types";

const scenario: TextEvalScenario = {
  id: "test-001",
  title: "Test scenario",
  description: "Test scenario",
  category: "identity",
  severity: "critical",
  modality: "text",
  input: "Hello",
  pass: (output) => output.includes("world"),
  failMessage: "Should include world",
};

describe("TextAdapter", () => {
  it("returns passing result when pass function returns true", async () => {
    const adapter = new TextAdapter(async () => "hello world");
    const result = await adapter.run(scenario, {});
    expect(result.passed).toBe(true);
    expect(result.failMessage).toBeUndefined();
  });

  it("returns failing result when pass function returns false", async () => {
    const adapter = new TextAdapter(async () => "hello there");
    const result = await adapter.run(scenario, {});
    expect(result.passed).toBe(false);
    expect(result.failMessage).toBe("Should include world");
  });

  it("captures output in result", async () => {
    const adapter = new TextAdapter(async () => "captured output");
    const result = await adapter.run(scenario, {});
    expect(result.output).toBe("captured output");
  });
});
