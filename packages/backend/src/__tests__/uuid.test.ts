import { describe, expect, it } from "vitest";
import { profileIdOfUuid, profileUuid } from "../domain/builtin-profiles.js";
import { uuidV5 } from "../domain/uuid.js";

describe("uuid v5", () => {
  it("matches the published example", () => {
    expect(
      uuidV5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"),
    ).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
  });

  it("gives the same answer every time", () => {
    expect(profileUuid("normal")).toBe(profileUuid("normal"));
    expect(profileUuid("normal")).not.toBe(profileUuid("sport"));
  });
});

describe("built-in profile ids", () => {
  it("round-trips built-ins and leaves other ids alone", () => {
    for (const id of ["normal", "sport", "sick", "menstruation"]) {
      expect(profileIdOfUuid(profileUuid(id))).toBe(id);
    }
    const custom = "0d2c1b0a-1111-4222-8333-444455556666";
    expect(profileUuid(custom)).toBe(custom);
    expect(profileIdOfUuid(custom)).toBe(custom);
  });
});
