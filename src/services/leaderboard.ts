import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { players, type PlayerRow } from "../db/schema.js";
import { gameConfig, type LeaderboardBot } from "../config/game.js";
import type { OptionalRedis } from "../lib/redis.js";

export interface RankedEntry {
  playerId: string;
  nickname: string;
  avatarId: number;
  netStars: number;
  rank: number;
  isSelf: boolean;
  isBot: boolean;
}

interface BoardEntry {
  playerId: string;
  nickname: string;
  avatarId: number;
  netStars: number;
  isBot?: boolean;
}

function compareEntries(left: BoardEntry, right: BoardEntry): number {
  const stars = right.netStars - left.netStars;
  if (stars) return stars;
  const kind = Number(left.isBot ?? false) - Number(right.isBot ?? false);
  if (kind) return kind;
  const leftId = Number(left.playerId);
  const rightId = Number(right.playerId);
  return Number.isSafeInteger(leftId) && Number.isSafeInteger(rightId)
    ? leftId - rightId
    : left.playerId.localeCompare(right.playerId);
}

export function mergeLeaderboard(
  realPlayers: readonly BoardEntry[],
  bots: readonly LeaderboardBot[],
  selfPublicId: string,
  limit = 100,
): RankedEntry[] {
  const merged: BoardEntry[] = [
    ...realPlayers.map((entry) => ({ ...entry, isBot: false })),
    ...bots.map((bot) => ({
      playerId: bot.botId,
      nickname: bot.nickname,
      avatarId: bot.avatarId,
      netStars: bot.netStars,
      isBot: true,
    })),
  ].sort(compareEntries);
  return merged.slice(0, Math.max(1, Math.min(gameConfig.rules.leaderboard.limit, limit))).map((entry, index) => ({
    playerId: entry.playerId,
    nickname: entry.nickname,
    avatarId: entry.avatarId,
    netStars: entry.netStars,
    isBot: entry.isBot ?? false,
    rank: index + 1,
    isSelf: entry.isBot !== true && entry.playerId === selfPublicId,
  }));
}

function isBoardCache(value: unknown): value is BoardEntry[] {
  return Array.isArray(value) && value.every((entry) => (
    entry &&
    typeof entry === "object" &&
    typeof (entry as BoardEntry).playerId === "string" &&
    typeof (entry as BoardEntry).nickname === "string" &&
    Number.isSafeInteger((entry as BoardEntry).avatarId) &&
    Number.isSafeInteger((entry as BoardEntry).netStars)
  ));
}

export async function loadLeaderboard(self: PlayerRow, cache: OptionalRedis): Promise<{
  entries: RankedEntry[];
  self: RankedEntry | null;
  ownRank: number | null;
  cached: boolean;
}> {
  const limit = gameConfig.rules.leaderboard.limit;
  const cacheKey = `rank-board:${self.seasonId}`;
  const cached = await cache.getJson<unknown>(cacheKey);
  let realRows = isBoardCache(cached) ? cached : null;
  const boardCached = realRows !== null;
  if (!realRows) {
    const rows = await db
      .select({
        publicId: players.publicId,
        nickname: players.nickname,
        avatarId: players.avatarId,
        netStars: players.netStars,
      })
      .from(players)
      .where(eq(players.seasonId, self.seasonId))
      .orderBy(desc(players.netStars), players.publicId)
      .limit(limit);
    realRows = rows.map((row) => ({
      playerId: String(row.publicId),
      nickname: row.nickname,
      avatarId: Number(row.avatarId),
      netStars: row.netStars,
    }));
    await cache.setJson(cacheKey, realRows, gameConfig.rules.leaderboard.cacheTtlSeconds);
  }

  const entries = mergeLeaderboard(
    realRows,
    gameConfig.bots,
    String(self.publicId),
    limit,
  );
  const includedSelf = entries.find((entry) => entry.isSelf) ?? null;
  if (includedSelf) return { entries, self: includedSelf, ownRank: includedSelf.rank, cached: boardCached };

  const [higher] = await db
    .select({ count: sql<number>`count(*)` })
    .from(players)
    .where(
      and(
        eq(players.seasonId, self.seasonId),
        or(
          sql`${players.netStars} > ${self.netStars}`,
          sql`(${players.netStars} = ${self.netStars} AND ${players.publicId} < ${self.publicId})`,
        ),
      ),
    );
  const higherReal = Number(higher?.count ?? 0);
  const higherBots = gameConfig.bots.filter((bot) => bot.netStars > self.netStars).length;
  const rank = higherReal + higherBots + 1;
  return {
    entries,
    self: {
      playerId: String(self.publicId),
      nickname: self.nickname,
      avatarId: Number(self.avatarId),
      netStars: self.netStars,
      rank,
      isSelf: true,
      isBot: false,
    },
    ownRank: rank,
    cached: boardCached,
  };
}
