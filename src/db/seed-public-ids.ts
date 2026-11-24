import { pool } from "./client.js";
import { randomPublicId } from "../lib/player-identity.js";
import type { RowDataPacket } from "mysql2/promise";

function argument(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const count = Number(argument("count", "5000"));
const ifEmpty = process.argv.includes("--if-empty");
if (!Number.isInteger(count) || count < 1 || count > 200_000) throw new Error("--count must be 1..200000");

try {
  if (ifEmpty) {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM player_public_ids");
    if (Number(rows[0]?.count ?? 0) > 0) {
      console.log("Public ID pool already contains numbers; seeding skipped");
      process.exitCode = 0;
    } else {
      const values = new Set<number>();
      while (values.size < count) values.add(randomPublicId());
      const items = [...values];
      for (let offset = 0; offset < items.length; offset += 500) {
        const chunk = items.slice(offset, offset + 500).map((value) => [value]);
        await pool.query("INSERT IGNORE INTO player_public_ids (public_id) VALUES ?", [chunk]);
      }
      console.log(`Public ID pool seeded with up to ${count} random 6-8 digit numbers`);
    }
  } else {
    const values = new Set<number>();
    while (values.size < count) values.add(randomPublicId());
    const items = [...values];
    for (let offset = 0; offset < items.length; offset += 500) {
      const chunk = items.slice(offset, offset + 500).map((value) => [value]);
      await pool.query("INSERT IGNORE INTO player_public_ids (public_id) VALUES ?", [chunk]);
    }
    console.log(`Public ID pool seeded with up to ${count} random 6-8 digit numbers`);
  }
} finally {
  await pool.end();
}
