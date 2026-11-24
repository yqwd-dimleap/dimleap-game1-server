import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(
  process.env.GAME_CONFIG_SOURCE ?? path.join(root, "../MyProject1/assets/resources/config/game"),
);
const target = path.join(root, "config/game");
const files = [
  "ai_difficulty_config.json",
  "hero_config.json",
  "hero_level_config.json",
  "item_config.json",
  "rank_config.json",
  "season_merit_reward.json",
  "season_ranking_reward.json",
];

await mkdir(target, { recursive: true });
const hash = createHash("sha256");
for (const file of files) {
  const sourcePath = path.join(source, file);
  const bytes = await readFile(sourcePath);
  hash.update(file);
  hash.update("\0");
  hash.update(bytes);
  hash.update("\0");
  await copyFile(sourcePath, path.join(target, file));
}
const configVersion = hash.digest("hex");
await writeFile(
  path.join(target, "sha256.json"),
  `${JSON.stringify({ configVersion, files }, null, 2)}\n`,
);
console.log(`Synced ${files.length} game tables from ${source}`);
console.log(`configVersion=${configVersion}`);
