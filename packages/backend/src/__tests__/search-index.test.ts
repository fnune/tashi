import { describe, expect, it } from "vitest";
import { catalogContents } from "../data/static-catalog/build.js";
import { SearchIndex } from "../data/static-catalog/search-index.js";
import { StoredDataError } from "../data/stored-data-error.js";
import { testBuild } from "./test-catalog.js";

const built = () => catalogContents(testBuild).searchIndex;

describe("search index", () => {
  it("reads the index the build writes", () => {
    expect(SearchIndex.parse(built()).label).toBe(testBuild.label);
  });

  it("refuses a food summary of the wrong shape", () => {
    const index = built();
    expect(() =>
      SearchIndex.parse({
        ...index,
        summaries: [[1, "Rice", null, "28", null, null, null]],
      }),
    ).toThrow(StoredDataError);
  });

  it("refuses a term that points past the last food", () => {
    const index = built();
    index.terms.rice = [index.summaries.length];
    expect(() => SearchIndex.parse(index)).toThrow(StoredDataError);
  });

  it("refuses an index without a label", () => {
    expect(() => SearchIndex.parse({ ...built(), label: "" })).toThrow(
      StoredDataError,
    );
  });
});
