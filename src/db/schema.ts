import {
  bigint,
  boolean,
  index,
  int,
  json,
  mysqlTable,
  primaryKey,
  timestamp,
  tinyint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const players = mysqlTable(
  "players",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey(),
    publicId: int("public_id", { unsigned: true }).notNull(),
    nickname: varchar("nickname", { length: 19 }).notNull(),
    avatarId: tinyint("avatar_id").notNull(),
    coins: bigint("coins", { mode: "number", unsigned: true }).notNull(),
    netStars: int("net_stars", { unsigned: true }).notNull(),
    matches: int("matches", { unsigned: true }).notNull(),
    merit: int("merit", { unsigned: true }).notNull(),
    seasonId: varchar("season_id", { length: 32 }).notNull(),
    lineupJson: json("lineup_json").$type<(string | null)[]>().notNull(),
    configVersion: varchar("config_version", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex("players_public_id_uq").on(table.publicId),
    index("players_stars_idx").on(table.netStars, table.publicId),
    index("players_updated_idx").on(table.updatedAt),
  ],
);

export const authIdentities = mysqlTable(
  "auth_identities",
  {
    provider: varchar("provider", { length: 16 }).notNull(),
    platformUid: varchar("platform_uid", { length: 128 }).notNull(),
    playerId: bigint("player_id", { mode: "bigint" })
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.platformUid] }),
    index("auth_player_idx").on(table.playerId),
  ],
);

export const heroProgress = mysqlTable(
  "hero_progress",
  {
    playerId: bigint("player_id", { mode: "bigint" })
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    heroKey: varchar("hero_key", { length: 32 }).notNull(),
    level: int("level", { unsigned: true }).notNull(),
    shards: int("shards", { unsigned: true }).notNull(),
    unlocked: boolean("unlocked").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => [primaryKey({ columns: [table.playerId, table.heroKey] })],
);

export const battleResults = mysqlTable(
  "battle_results",
  {
    battleId: varchar("battle_id", { length: 36 }).primaryKey(),
    playerId: bigint("player_id", { mode: "bigint" })
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    result: varchar("result", { length: 8 }).notNull(),
    difficultyId: int("difficulty_id", { unsigned: true }).notNull(),
    configVersion: varchar("config_version", { length: 64 }).notNull(),
    starsBefore: int("stars_before", { unsigned: true }).notNull(),
    starsAfter: int("stars_after", { unsigned: true }).notNull(),
    rewardJson: json("reward_json").$type<Record<string, unknown>>().notNull(),
    startedAt: timestamp("started_at").notNull(),
    finishedAt: timestamp("finished_at").notNull(),
  },
  (table) => [
    index("battle_player_finished_idx").on(table.playerId, table.finishedAt),
    index("battle_finished_idx").on(table.finishedAt),
  ],
);

export const rewardClaims = mysqlTable(
  "reward_claims",
  {
    playerId: bigint("player_id", { mode: "bigint" })
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    seasonId: varchar("season_id", { length: 32 }).notNull(),
    rewardType: varchar("reward_type", { length: 24 }).notNull(),
    rewardId: varchar("reward_id", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.playerId, table.seasonId, table.rewardType, table.rewardId] })],
);

export const playerPublicIds = mysqlTable(
  "player_public_ids",
  {
    publicId: int("public_id", { unsigned: true }).primaryKey(),
    assignedPlayerId: bigint("assigned_player_id", { mode: "bigint" })
      .references(() => players.id, { onDelete: "set null" }),
    assignedAt: timestamp("assigned_at"),
  },
  (table) => [uniqueIndex("player_public_ids_assigned_uq").on(table.assignedPlayerId)],
);

export type PlayerRow = typeof players.$inferSelect;
export type HeroProgressRow = typeof heroProgress.$inferSelect;
export type BattleResultRow = typeof battleResults.$inferSelect;
