import { describe, expect, it } from "vitest";
import { termsOf } from "../data/static-catalog/terms.js";

describe("catalog terms", () => {
  it("drops stop words, so no food matches on 'with' alone", () => {
    expect(termsOf("Rice with beans")).toEqual(["rice", "bean"]);
  });

  it("reduces each word to its stem, so 'cooking' finds 'cooked'", () => {
    expect(termsOf("cooking")).toEqual(termsOf("cooked"));
  });
});
