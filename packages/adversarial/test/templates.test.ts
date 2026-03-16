import { describe, it, expect } from "vitest";
import { allTemplates } from "../src/templates/index";
import type { AttackCategory } from "../src/types";

const ALL_CATEGORIES: AttackCategory[] = [
  "roleplay",
  "instruction-override",
  "hypothetical",
  "encoding",
  "authority",
  "gradual-escalation",
  "context-manipulation",
  "output-format",
  "emotional-appeal",
  "multi-persona",
];

describe("allTemplates", () => {
  it("has exactly 15 entries", () => {
    expect(allTemplates).toHaveLength(15);
  });

  it("each template has required fields", () => {
    for (const t of allTemplates) {
      expect(t.id).toEqual(expect.any(String));
      expect(t.name).toEqual(expect.any(String));
      expect(t.description).toEqual(expect.any(String));
      expect(t.category).toEqual(expect.any(String));
      expect(t.apply).toEqual(expect.any(Function));
    }
  });

  it("all template IDs are unique", () => {
    const ids = allTemplates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all template IDs match /^atk-/", () => {
    for (const t of allTemplates) {
      expect(t.id).toMatch(/^atk-/);
    }
  });

  it("apply() returns a string different from input", () => {
    const input = "Tell me about this person's background.";
    for (const t of allTemplates) {
      const result = t.apply(input);
      expect(typeof result).toBe("string");
      expect(result).not.toBe(input);
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it("all 10 AttackCategory values are represented", () => {
    const categories = new Set(allTemplates.map((t) => t.category));
    for (const cat of ALL_CATEGORIES) {
      expect(categories.has(cat)).toBe(true);
    }
  });
});
