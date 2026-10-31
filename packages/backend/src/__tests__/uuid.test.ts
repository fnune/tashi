import { describe, expect, it } from "vitest";
import {
  BUILTIN_PROFILE_UUIDS,
  profileIdOfUuid,
  profileUuid,
} from "../domain/builtin-profiles.js";
import { uuidV5 } from "./uuid-v5.js";

describe("uuid v5", () => {
  it("matches the published example", () => {
    expect(
      uuidV5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"),
    ).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
  });

  it("keeps each built-in profile at the v5 uuid of its old id, which stored settings refer to", () => {
    for (const [id, uuid] of BUILTIN_PROFILE_UUIDS) {
      expect(uuid).toBe(uuidV5(id, "5d0a8f4e-3b6c-4d1e-9a27-8c4f1e2b7d90"));
    }
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
