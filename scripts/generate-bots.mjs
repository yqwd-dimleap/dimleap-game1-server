import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const names = [
  "墨影", "长风", "山河", "青鸾", "照夜", "惊鸿", "听雨", "凌霄",
  "无咎", "星河", "飞白", "玄策", "归鸿", "扶摇", "清越", "空山",
];
const target = path.join(root, "config/leaderboard-bots.json");
const bots = Array.from({ length: 100 }, (_, index) => ({
  botId: `bot_${String(index + 1).padStart(3, "0")}`,
  nickname: `${names[index % names.length]}${100 + Math.floor(index / names.length) * 17 + (index % 17)}`,
  avatarId: (index % 8) + 1,
  netStars: Math.max(0, 50 - Math.floor(index * 0.51)),
}));

await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(bots, null, 2)}\n`);
console.log(`Generated ${bots.length} leaderboard bots at ${target}`);
