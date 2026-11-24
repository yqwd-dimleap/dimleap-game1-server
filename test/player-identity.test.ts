import { describe, expect, it } from "vitest";
import { randomPublicId } from "../src/lib/player-identity.js";

describe("player identity", () => {
  it("generates six to eight digit public IDs", () => {
    for (let index = 0; index < 10_000; index++) {
      expect(String(randomPublicId())).toMatch(/^\d{6,8}$/);
    }
  });
});
