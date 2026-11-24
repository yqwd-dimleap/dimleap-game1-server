import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export type HeroKey =
  | "swordsman"
  | "archer"
  | "cavalry"
  | "shield"
  | "huopaoche"
  | "gongnuche"
  | "guanyu"
  | "zhangfei"
  | "simayi"
  | "zhugeliang"
  | "liubei"
  | "caocao"
  | "huangzhong"
  | "sunquan"
  | "zhaoyun"
  | "lvbu"
  | "zhouyu"
  | "xiaoqiao"
  | "dianwei";

export const HERO_KEYS: Readonly<Record<number, HeroKey>> = Object.freeze({
  1: "swordsman",
  2: "archer",
  3: "cavalry",
  4: "shield",
  5: "huopaoche",
  6: "gongnuche",
  7: "guanyu",
  8: "zhangfei",
  9: "simayi",
  10: "zhugeliang",
  11: "liubei",
  12: "caocao",
  13: "huangzhong",
  14: "sunquan",
  15: "zhaoyun",
  16: "lvbu",
  17: "zhouyu",
  18: "xiaoqiao",
  19: "dianwei",
});

export interface HeroConfigRow {
  key: HeroKey;
  tableId: number;
  name: string;
  hp: number;
  attack: number;
  move_speed_px_s: number;
  attack_rate_s: number;
  attack_wait_s: number;
  attack_range_px: number;
  initial_count: number;
  action_point_cost: number;
  fragment_item_id: number;
  initially_unlocked: number;
  unlock_fragments: number;
  tier: number;
  tier_name: string;
  hero_description: string;
  attack_tier: number;
}

export interface LevelConfigRow {
  level: number;
  hp_multiplier: number;
  attack_multiplier: number;
  next_level_gold: number;
  next_level_fragments: number;
  can_upgrade: number;
}

export interface ItemConfigRow {
  id: number;
  name: string;
  tier: number;
  tier_name: string;
  item_type: "currency" | "hero_fragment";
}

export interface RankConfigRow {
  id: number;
  name: string;
  division_start: number;
  min_stars: number;
  max_stars: number;
  stars_per_division: number;
  is_repeating: number;
  repeat_start: number;
  name_template: string;
  ai_difficulty_id: number;
}

export interface DifficultyConfigRow {
  id: number;
  name: string;
  enemy_hero_level: number;
  aim_error_deg: number;
  power_error_ratio: number;
  bonus_zone_weight: number;
  displace_enemy_weight: number;
}

export interface MeritRewardRow {
  id: number;
  requiredMerit: number;
  items: readonly { id: number; amount: number }[];
}

export interface RankingRewardRow {
  id: number;
  name: string;
  minRank: number;
  maxRank: number;
  items: readonly { id: number; amount: number }[];
}

export interface BattleRewardRule {
  coins: number;
  stars: number;
  merit: number;
}

export interface GameRules {
  seasonId: string;
  initialCoins: number;
  defaultNicknamePrefix: string;
  battle: {
    ticketTtlSeconds: number;
    minimumDurationSeconds: number;
    maximumDurationSeconds: number;
    win: BattleRewardRule;
    loss: BattleRewardRule;
  };
  leaderboard: {
    limit: number;
    cacheTtlSeconds: number;
  };
}

export interface LeaderboardBot {
  botId: string;
  nickname: string;
  avatarId: number;
  netStars: number;
}

export interface DifficultySnapshot {
  difficultyId: number;
  name: string;
  enemyHeroLevel: number;
  aimErrorDeg: number;
  powerErrorRatio: number;
  bonusZoneWeight: number;
  displaceEnemyWeight: number;
}

type NumericTable = Record<string, Record<string, unknown>>;

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

function asTable(file: string, value: unknown): NumericTable {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${file}: expected a JSON object table`);
  }
  return value as NumericTable;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label}: expected integer >= ${minimum}`);
  }
  return value;
}

function number(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${label}: expected number >= ${minimum}`);
  }
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}: expected non-empty text`);
  return value;
}

function flag(value: unknown, label: string): number {
  if (value !== 0 && value !== 1) throw new Error(`${label}: expected 0 or 1`);
  return value;
}

function validateRules(value: unknown): GameRules {
  const rules = value as Partial<GameRules>;
  if (!rules || typeof rules !== "object" || !rules.battle || !rules.leaderboard) {
    throw new Error("game-rules.json: invalid root object");
  }
  text(rules.seasonId, "game-rules.seasonId");
  text(rules.defaultNicknamePrefix, "game-rules.defaultNicknamePrefix");
  integer(rules.initialCoins, "game-rules.initialCoins");
  const battle = rules.battle;
  for (const key of ["win", "loss"] as const) {
    const reward = battle[key];
    if (!reward || typeof reward !== "object") throw new Error(`game-rules.battle.${key}: missing`);
    integer(reward.coins, `game-rules.battle.${key}.coins`);
    if (!Number.isSafeInteger(reward.stars)) throw new Error(`game-rules.battle.${key}.stars: expected integer`);
    integer(reward.merit, `game-rules.battle.${key}.merit`);
  }
  const ttl = integer(battle.ticketTtlSeconds, "game-rules.battle.ticketTtlSeconds", 1);
  const minDuration = integer(battle.minimumDurationSeconds, "game-rules.battle.minimumDurationSeconds");
  const maxDuration = integer(battle.maximumDurationSeconds, "game-rules.battle.maximumDurationSeconds", 1);
  if (minDuration >= maxDuration || ttl < maxDuration) throw new Error("game-rules: invalid battle time limits");
  integer(rules.leaderboard.limit, "game-rules.leaderboard.limit", 1);
  integer(rules.leaderboard.cacheTtlSeconds, "game-rules.leaderboard.cacheTtlSeconds", 1);
  return rules as GameRules;
}

function validateBots(value: unknown): readonly LeaderboardBot[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("leaderboard-bots.json: expected non-empty array");
  const ids = new Set<string>();
  return value.map((entry, index) => {
    const row = entry as Partial<LeaderboardBot>;
    const botId = text(row.botId, `bot[${index}].botId`);
    if (ids.has(botId)) throw new Error(`leaderboard-bots.json: duplicate botId ${botId}`);
    ids.add(botId);
    return {
      botId,
      nickname: text(row.nickname, `bot[${index}].nickname`),
      avatarId: integer(row.avatarId, `bot[${index}].avatarId`, 1),
      netStars: integer(row.netStars, `bot[${index}].netStars`),
    };
  });
}

export class GameConfig {
  readonly configVersion: string;
  readonly rules: GameRules;
  readonly heroes: Readonly<Record<HeroKey, HeroConfigRow>>;
  readonly heroById: Readonly<Record<number, HeroConfigRow>>;
  readonly heroByFragmentItemId: Readonly<Record<number, HeroConfigRow>>;
  readonly levels: Readonly<Record<number, LevelConfigRow>>;
  readonly items: Readonly<Record<number, ItemConfigRow>>;
  readonly ranks: readonly RankConfigRow[];
  readonly difficulties: Readonly<Record<number, DifficultyConfigRow>>;
  readonly milestones: readonly MeritRewardRow[];
  readonly rankingRewards: readonly RankingRewardRow[];
  readonly bots: readonly LeaderboardBot[];

  constructor(directory = process.env.GAME_CONFIG_DIR ?? path.resolve(process.cwd(), "config")) {
    const gameDirectory = path.join(directory, "game");
    const raw = {
      ai: asTable("ai_difficulty_config.json", readJson(path.join(gameDirectory, "ai_difficulty_config.json"))),
      heroes: asTable("hero_config.json", readJson(path.join(gameDirectory, "hero_config.json"))),
      levels: asTable("hero_level_config.json", readJson(path.join(gameDirectory, "hero_level_config.json"))),
      items: asTable("item_config.json", readJson(path.join(gameDirectory, "item_config.json"))),
      ranks: asTable("rank_config.json", readJson(path.join(gameDirectory, "rank_config.json"))),
      merit: asTable("season_merit_reward.json", readJson(path.join(gameDirectory, "season_merit_reward.json"))),
      ranking: asTable("season_ranking_reward.json", readJson(path.join(gameDirectory, "season_ranking_reward.json"))),
    };

    this.configVersion = text(
      (readJson(path.join(gameDirectory, "sha256.json")) as { configVersion?: unknown }).configVersion,
      "sha256.json.configVersion",
    );
    if (!/^[a-f0-9]{64}$/i.test(this.configVersion)) throw new Error("sha256.json.configVersion: invalid SHA-256");
    this.rules = validateRules(readJson(path.join(directory, "game-rules.json")));
    this.bots = validateBots(readJson(path.join(directory, "leaderboard-bots.json")));

    const heroes: Partial<Record<HeroKey, HeroConfigRow>> = {};
    const heroById: Record<number, HeroConfigRow> = {};
    for (const [rawId, rawRow] of Object.entries(raw.heroes)) {
      const tableId = integer(Number(rawId), `hero_config/${rawId}`);
      const key = HERO_KEYS[tableId];
      if (!key) throw new Error(`hero_config/${rawId}: no stable hero key mapping`);
      const row: HeroConfigRow = {
        key,
        tableId,
        name: text(rawRow.name, `hero_config/${rawId}/name`),
        hp: integer(rawRow.hp, `hero_config/${rawId}/hp`, 1),
        attack: integer(rawRow.attack, `hero_config/${rawId}/attack`, 1),
        move_speed_px_s: number(rawRow.move_speed_px_s, `hero_config/${rawId}/move_speed_px_s`, 1),
        attack_rate_s: number(rawRow.attack_rate_s, `hero_config/${rawId}/attack_rate_s`),
        attack_wait_s: number(rawRow.attack_wait_s, `hero_config/${rawId}/attack_wait_s`),
        attack_range_px: number(rawRow.attack_range_px, `hero_config/${rawId}/attack_range_px`, 1),
        initial_count: integer(rawRow.initial_count, `hero_config/${rawId}/initial_count`, 1),
        action_point_cost: integer(rawRow.action_point_cost, `hero_config/${rawId}/action_point_cost`, 1),
        fragment_item_id: integer(rawRow.fragment_item_id, `hero_config/${rawId}/fragment_item_id`, 1),
        initially_unlocked: flag(rawRow.initially_unlocked, `hero_config/${rawId}/initially_unlocked`),
        unlock_fragments: integer(rawRow.unlock_fragments, `hero_config/${rawId}/unlock_fragments`),
        tier: integer(rawRow.tier, `hero_config/${rawId}/tier`),
        tier_name: text(rawRow.tier_name, `hero_config/${rawId}/tier_name`),
        hero_description: text(rawRow.hero_description, `hero_config/${rawId}/hero_description`),
        attack_tier: integer(rawRow.attack_tier, `hero_config/${rawId}/attack_tier`, 1),
      };
      heroes[key] = row;
      heroById[tableId] = row;
    }
    this.heroes = Object.freeze(heroes) as Readonly<Record<HeroKey, HeroConfigRow>>;
    this.heroById = Object.freeze(heroById);

    const items: Record<number, ItemConfigRow> = {};
    for (const [rawId, rawRow] of Object.entries(raw.items)) {
      const id = Number(rawId);
      const itemType = text(rawRow.item_type, `item_config/${rawId}/item_type`);
      if (itemType !== "currency" && itemType !== "hero_fragment") {
        throw new Error(`item_config/${rawId}/item_type: unsupported ${itemType}`);
      }
      items[id] = {
        id,
        name: text(rawRow.name, `item_config/${rawId}/name`),
        tier: integer(rawRow.tier, `item_config/${rawId}/tier`),
        tier_name: text(rawRow.tier_name, `item_config/${rawId}/tier_name`),
        item_type: itemType,
      };
    }
    this.items = Object.freeze(items);

    const fragmentMap: Record<number, HeroConfigRow> = {};
    for (const hero of Object.values(this.heroes)) {
      if (!this.items[hero.fragment_item_id]) throw new Error(`hero ${hero.key}: missing fragment item`);
      if (fragmentMap[hero.fragment_item_id]) throw new Error(`duplicate fragment item ${hero.fragment_item_id}`);
      fragmentMap[hero.fragment_item_id] = hero;
    }
    this.heroByFragmentItemId = Object.freeze(fragmentMap);

    const levels: Record<number, LevelConfigRow> = {};
    for (const [rawId, rawRow] of Object.entries(raw.levels)) {
      const level = integer(Number(rawId), `hero_level_config/${rawId}`, 1);
      levels[level] = {
        level,
        hp_multiplier: number(rawRow.hp_multiplier, `hero_level_config/${rawId}/hp_multiplier`, 1),
        attack_multiplier: number(rawRow.attack_multiplier, `hero_level_config/${rawId}/attack_multiplier`, 1),
        next_level_gold: integer(rawRow.next_level_gold, `hero_level_config/${rawId}/next_level_gold`),
        next_level_fragments: integer(rawRow.next_level_fragments, `hero_level_config/${rawId}/next_level_fragments`),
        can_upgrade: flag(rawRow.can_upgrade, `hero_level_config/${rawId}/can_upgrade`),
      };
    }
    const levelIds = Object.keys(levels).map(Number).sort((a, b) => a - b);
    if (!levelIds.length || levelIds.some((value, index) => value !== index + 1)) {
      throw new Error("hero_level_config: levels must be contiguous starting at 1");
    }
    this.levels = Object.freeze(levels);

    const difficulties: Record<number, DifficultyConfigRow> = {};
    for (const [rawId, rawRow] of Object.entries(raw.ai)) {
      const id = integer(Number(rawId), `ai_difficulty_config/${rawId}`, 1);
      const enemyHeroLevel = integer(rawRow.enemy_hero_level, `ai_difficulty_config/${rawId}/enemy_hero_level`, 1);
      if (!this.levels[enemyHeroLevel]) {
        throw new Error(`ai_difficulty_config/${rawId}: unknown enemy hero level ${enemyHeroLevel}`);
      }
      difficulties[id] = {
        id,
        name: text(rawRow.name, `ai_difficulty_config/${rawId}/name`),
        enemy_hero_level: enemyHeroLevel,
        aim_error_deg: number(rawRow.aim_error_deg, `ai_difficulty_config/${rawId}/aim_error_deg`),
        power_error_ratio: number(rawRow.power_error_ratio, `ai_difficulty_config/${rawId}/power_error_ratio`),
        bonus_zone_weight: number(rawRow.bonus_zone_weight, `ai_difficulty_config/${rawId}/bonus_zone_weight`),
        displace_enemy_weight: number(rawRow.displace_enemy_weight, `ai_difficulty_config/${rawId}/displace_enemy_weight`),
      };
    }
    this.difficulties = Object.freeze(difficulties);

    this.ranks = Object.freeze(
      Object.entries(raw.ranks)
        .map(([rawId, rawRow]) => ({
          id: integer(Number(rawId), `rank_config/${rawId}`, 1),
          name: text(rawRow.name, `rank_config/${rawId}/name`),
          division_start: integer(rawRow.division_start, `rank_config/${rawId}/division_start`),
          min_stars: integer(rawRow.min_stars, `rank_config/${rawId}/min_stars`),
          max_stars: Number(rawRow.max_stars),
          stars_per_division: integer(rawRow.stars_per_division, `rank_config/${rawId}/stars_per_division`, 1),
          is_repeating: flag(rawRow.is_repeating, `rank_config/${rawId}/is_repeating`),
          repeat_start: integer(rawRow.repeat_start, `rank_config/${rawId}/repeat_start`),
          name_template: text(rawRow.name_template, `rank_config/${rawId}/name_template`),
          ai_difficulty_id: integer(rawRow.ai_difficulty_id, `rank_config/${rawId}/ai_difficulty_id`, 1),
        }))
        .sort((a, b) => a.min_stars - b.min_stars),
    );
    let previousMax = -1;
    for (const rank of this.ranks) {
      if (rank.min_stars !== previousMax + 1 || !this.difficulties[rank.ai_difficulty_id]) {
        throw new Error(`rank_config/${rank.id}: discontinuous stars or missing AI difficulty`);
      }
      if (rank.max_stars !== -1 && rank.max_stars < rank.min_stars) {
        throw new Error(`rank_config/${rank.id}: invalid max_stars`);
      }
      previousMax = rank.max_stars;
    }
    if (previousMax !== -1) throw new Error("rank_config: final rank must be unbounded");

    this.milestones = Object.freeze(
      Object.entries(raw.merit)
        .map(([rawId, rawRow]) => {
          const id = integer(Number(rawId), `season_merit_reward/${rawId}`, 1);
          const items: { id: number; amount: number }[] = [];
          for (let index = 1; index <= 6; index++) {
            const itemId = integer(rawRow[`item_${index}`], `season_merit_reward/${rawId}/item_${index}`);
            const amount = integer(rawRow[`amount_item_${index}`], `season_merit_reward/${rawId}/amount_item_${index}`);
            if (itemId === 0) {
              if (amount !== 0) throw new Error(`season_merit_reward/${rawId}: amount without item`);
              continue;
            }
            if (!this.items[itemId] || amount === 0) throw new Error(`season_merit_reward/${rawId}: invalid reward item`);
            items.push({ id: itemId, amount });
          }
          return {
            id,
            requiredMerit: integer(rawRow.required_merit, `season_merit_reward/${rawId}/required_merit`),
            items: Object.freeze(items),
          };
        })
        .sort((a, b) => a.requiredMerit - b.requiredMerit || a.id - b.id),
    );

    this.rankingRewards = Object.freeze(
      Object.entries(raw.ranking).map(([rawId, rawRow]) => {
        const id = integer(Number(rawId), `season_ranking_reward/${rawId}`, 1);
        const items: { id: number; amount: number }[] = [];
        for (let index = 1; index <= 3; index++) {
          const itemId = integer(rawRow[`item_${index}`], `season_ranking_reward/${rawId}/item_${index}`);
          const amount = integer(rawRow[`amount_item_${index}`], `season_ranking_reward/${rawId}/amount_item_${index}`);
          if (itemId > 0 || amount > 0) {
            if (!this.items[itemId] || amount === 0) throw new Error(`season_ranking_reward/${rawId}: invalid reward item`);
            items.push({ id: itemId, amount });
          }
        }
        return {
          id,
          name: text(rawRow.name, `season_ranking_reward/${rawId}/name`),
          minRank: integer(rawRow.min_rank, `season_ranking_reward/${rawId}/min_rank`, 1),
          maxRank: Number(rawRow.max_rank),
          items: Object.freeze(items),
        };
      }),
    );
  }

  rankForStars(stars: number): RankConfigRow {
    const safe = Math.max(0, Math.floor(Number.isFinite(stars) ? stars : 0));
    const rank = this.ranks.find((row) => safe >= row.min_stars && (row.max_stars === -1 || safe <= row.max_stars));
    if (!rank) throw new Error(`No rank config for ${safe} stars`);
    return rank;
  }

  difficultyForStars(stars: number): DifficultySnapshot {
    const rank = this.rankForStars(stars);
    const difficulty = this.difficulties[rank.ai_difficulty_id];
    if (!difficulty) throw new Error(`Missing difficulty ${rank.ai_difficulty_id}`);
    return {
      difficultyId: difficulty.id,
      name: difficulty.name,
      enemyHeroLevel: difficulty.enemy_hero_level,
      aimErrorDeg: difficulty.aim_error_deg,
      powerErrorRatio: difficulty.power_error_ratio,
      bonusZoneWeight: difficulty.bonus_zone_weight,
      displaceEnemyWeight: difficulty.displace_enemy_weight,
    };
  }

  heroByKey(key: string): HeroConfigRow | undefined {
    return (this.heroes as Record<string, HeroConfigRow>)[key];
  }

  meritReward(id: number): MeritRewardRow | undefined {
    return this.milestones.find((row) => row.id === id);
  }

  configDigest(): string {
    return createHash("sha256").update(this.configVersion).digest("hex");
  }
}

export const gameConfig = new GameConfig();
