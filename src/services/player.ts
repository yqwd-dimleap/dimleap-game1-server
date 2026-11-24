import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  authIdentities,
  heroProgress,
  playerPublicIds,
  players,
  rewardClaims,
  type PlayerRow,
} from "../db/schema.js";
import { gameConfig } from "../config/game.js";
import { AppError } from "../lib/errors.js";
import { playerIdGenerator } from "../lib/ids.js";
import { parseJson } from "../lib/json.js";

export interface LoginIdentity {
  provider: string;
  platformUid: string;
}

export interface PlayerIdentityResult {
  playerId: bigint;
  publicId: string;
  created: boolean;
}

const CREATE_RETRIES = 8;

export async function loadCurrentPlayer(playerId: bigint): Promise<PlayerRow> {
  const [player] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (!player) throw new AppError(401, "PLAYER_NOT_FOUND", "玩家数据已不存在，请重新登录");
  if (
    player.seasonId === gameConfig.rules.seasonId &&
    player.configVersion === gameConfig.configVersion
  ) return player;

  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(players).where(eq(players.id, playerId)).for("update").limit(1);
    if (!current) throw new AppError(401, "PLAYER_NOT_FOUND", "玩家数据已不存在，请重新登录");
    const seasonChanged = current.seasonId !== gameConfig.rules.seasonId;
    const next = {
      ...current,
      ...(seasonChanged ? { netStars: 0, merit: 0, seasonId: gameConfig.rules.seasonId } : {}),
      configVersion: gameConfig.configVersion,
    };
    await tx
      .update(players)
      .set({
        ...(seasonChanged ? { netStars: 0, merit: 0, seasonId: gameConfig.rules.seasonId } : {}),
        configVersion: gameConfig.configVersion,
      })
      .where(eq(players.id, playerId));
    return next;
  });
}

export async function createOrGetPlayer(identity: LoginIdentity): Promise<PlayerIdentityResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < CREATE_RETRIES; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [existingIdentity] = await tx
          .select({ playerId: authIdentities.playerId })
          .from(authIdentities)
          .where(
            and(
              eq(authIdentities.provider, identity.provider),
              eq(authIdentities.platformUid, identity.platformUid),
            ),
          )
          .limit(1);
        if (existingIdentity) {
          const [player] = await tx
            .select()
            .from(players)
            .where(eq(players.id, existingIdentity.playerId))
            .for("update")
            .limit(1);
          if (!player) throw new AppError(500, "PLAYER_IDENTITY_BROKEN", "账号与玩家数据不一致");
          if (player.seasonId !== gameConfig.rules.seasonId) {
            await tx
              .update(players)
              .set({
                netStars: 0,
                merit: 0,
                seasonId: gameConfig.rules.seasonId,
                configVersion: gameConfig.configVersion,
              })
              .where(eq(players.id, player.id));
          } else if (player.configVersion !== gameConfig.configVersion) {
            await tx.update(players).set({ configVersion: gameConfig.configVersion }).where(eq(players.id, player.id));
          }
          return { playerId: existingIdentity.playerId, publicId: String(player.publicId), created: false };
        }

        const [publicNumber] = await tx
          .select({ publicId: playerPublicIds.publicId })
          .from(playerPublicIds)
          .where(isNull(playerPublicIds.assignedPlayerId))
          .orderBy(sql`RAND()`)
          .limit(1);
        if (!publicNumber) {
          throw new AppError(503, "PUBLIC_ID_POOL_EMPTY", "对外玩家 ID 号池已耗尽，请补充号池");
        }

        const playerId = playerIdGenerator.next();
        const orderedHeroes = Object.values(gameConfig.heroes).sort((a, b) => a.tableId - b.tableId);
        const initiallyUnlocked = orderedHeroes.filter((hero) => hero.initially_unlocked === 1).map((hero) => hero.key);
        const lineup: (string | null)[] = Array.from({ length: 5 }, (_, index) => initiallyUnlocked[index] ?? null);
        const baseNickname = `${gameConfig.rules.defaultNicknamePrefix}${String(publicNumber.publicId).slice(-4)}`;

        await tx.insert(players).values({
          id: playerId,
          publicId: publicNumber.publicId,
          nickname: baseNickname,
          avatarId: 1,
          coins: gameConfig.rules.initialCoins,
          netStars: 0,
          matches: 0,
          merit: 0,
          seasonId: gameConfig.rules.seasonId,
          lineupJson: lineup,
          configVersion: gameConfig.configVersion,
        });
        const [reserved] = await tx
          .update(playerPublicIds)
          .set({ assignedPlayerId: playerId, assignedAt: new Date() })
          .where(
            and(
              eq(playerPublicIds.publicId, publicNumber.publicId),
              isNull(playerPublicIds.assignedPlayerId),
            ),
          );
        if (reserved.affectedRows !== 1) throw new Error("PUBLIC_ID_RACE");
        await tx.insert(heroProgress).values(
          orderedHeroes.map((hero) => ({
            playerId,
            heroKey: hero.key,
            level: 1,
            shards: 0,
            unlocked: hero.initially_unlocked === 1,
          })),
        );
        await tx.insert(authIdentities).values({
          provider: identity.provider,
          platformUid: identity.platformUid,
          playerId,
        });
        return { playerId, publicId: String(publicNumber.publicId), created: true };
      });
    } catch (error) {
      lastError = error;
      const code = (error as { code?: string }).code;
      const retryable = code === "ER_DUP_ENTRY" || code === "ER_LOCK_DEADLOCK" ||
        code === "ER_LOCK_WAIT_TIMEOUT" || (error as Error).message === "PUBLIC_ID_RACE";
      if (!retryable) throw error;
      const [existing] = await db
        .select({ playerId: authIdentities.playerId })
        .from(authIdentities)
        .where(
          and(
            eq(authIdentities.provider, identity.provider),
            eq(authIdentities.platformUid, identity.platformUid),
          ),
        )
        .limit(1);
      if (existing) {
        const [player] = await db
          .select({ publicId: players.publicId })
          .from(players)
          .where(eq(players.id, existing.playerId))
          .limit(1);
        if (player) return { playerId: existing.playerId, publicId: String(player.publicId), created: false };
      }
    }
  }
  throw new AppError(503, "PLAYER_CREATE_CONFLICT", `玩家创建冲突，请重试：${String(lastError)}`);
}

export async function updatePlayerProfile(
  playerId: bigint,
  patch: { nickname?: string; avatarId?: number },
): Promise<void> {
  if (
    patch.nickname !== undefined &&
    (
      !patch.nickname.trim() ||
      Array.from(patch.nickname.trim()).length > 19 ||
      /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(patch.nickname)
    )
  ) {
    throw new AppError(400, "INVALID_NICKNAME", "昵称长度必须为 1–19 个字符，且不能包含换行或控制字符");
  }
  await db
    .update(players)
    .set({
      ...(patch.nickname !== undefined ? { nickname: patch.nickname.trim() } : {}),
      ...(patch.avatarId !== undefined ? { avatarId: patch.avatarId } : {}),
    })
    .where(eq(players.id, playerId));
}

export async function playerSnapshot(playerId: bigint) {
  const player = await loadCurrentPlayer(playerId);
  const heroes = await db.select().from(heroProgress).where(eq(heroProgress.playerId, playerId));
  const claims = await db
    .select({ rewardType: rewardClaims.rewardType, rewardId: rewardClaims.rewardId })
    .from(rewardClaims)
    .where(
      and(
        eq(rewardClaims.playerId, playerId),
        eq(rewardClaims.seasonId, player.seasonId),
        eq(rewardClaims.rewardType, "merit"),
      ),
    );
  return {
    player: {
      playerId: String(player.publicId),
      nickname: player.nickname,
      avatarId: Number(player.avatarId),
      coins: Number(player.coins),
      netStars: player.netStars,
      matches: player.matches,
      merit: player.merit,
      seasonId: player.seasonId,
      lineup: parseJson<(string | null)[]>(player.lineupJson, []),
    },
    heroes: Object.fromEntries(
      heroes.map((hero) => [
        hero.heroKey,
        {
          level: hero.level,
          shards: hero.shards,
          unlocked: Boolean(hero.unlocked),
        },
      ]),
    ),
    season: {
      seasonId: player.seasonId,
      merit: player.merit,
      claimedMilestoneIds: claims.map((claim) => claim.rewardId),
    },
    configVersion: gameConfig.configVersion,
  };
}
