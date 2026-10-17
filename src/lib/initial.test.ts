import { describe, expect, it } from "vitest";
import { initial } from "./initial";

describe("initial", () => {
  it("takes a whole emoji or accented letter, not half of one", () => {
    expect(initial("Alice")).toBe("A");
    expect(initial("🦊 Kit")).toBe("🦊");
    expect(initial("👨‍👩‍👧 family")).toBe("👨‍👩‍👧");
    expect(initial("émile")).toBe("é");
    expect(initial("")).toBe("");
  });
});
