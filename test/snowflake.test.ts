import { describe, expect, it } from "vitest";
import { SnowflakeGenerator } from "../src/lib/snowflake.js";

describe("SnowflakeGenerator", () => {
  it("generates monotonic unique positive Int64 integers", () => {
    let now = 1_800_000_000_000;
    const generator = new SnowflakeGenerator(1, 2, () => now);
    const ids = Array.from({ length: 5000 }, (_, index) => {
      if (index > 0 && index % 1000 === 0) now++;
      return generator.next();
    });
    expect(new Set(ids.map(String)).size).toBe(ids.length);
    expect(ids.every((id, index) => index === 0 || id > ids[index - 1]!)).toBe(true);
    expect(ids.every((id) => id > 0n && id < 1n << 63n)).toBe(true);
  });

  it("rejects values outside signed Int64", () => {
    const generator = new SnowflakeGenerator(0, 0, () => 9_000_000_000_000_000);
    expect(() => generator.next()).toThrow("signed Int64");
  });
});
