import { Type, type Static } from "@sinclair/typebox";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { heroProgress, players } from "../db/schema.js";
import { gameConfig } from "../config/game.js";
import { requirePlayerId } from "../lib/auth.js";
import { AppError, badRequest } from "../lib/errors.js";

const HeroBody = Type.Object({
  heroKey: Type.String({ minLength: 1, maxLength: 32 }),
});

async function transactionHero(playerId: bigint, heroKey: string, action: "unlock" | "upgrade") {
  return db.transaction(async (tx) => {
    const heroConfig = gameConfig.heroByKey(heroKey);
    if (!heroConfig) throw new AppError(400, "UNKNOWN_HERO", "未知英雄");
    const [player] = await tx.select().from(players).where(eq(players.id, playerId)).for("update").limit(1);
    if (!player) throw new AppError(404, "PLAYER_NOT_FOUND", "玩家不存在");
    const [hero] = await tx
      .select()
      .from(heroProgress)
      .where(and(eq(heroProgress.playerId, playerId), eq(heroProgress.heroKey, heroKey)))
      .for("update")
      .limit(1);
    if (!hero) throw new AppError(404, "HERO_PROGRESS_NOT_FOUND", "英雄进度不存在");

    if (action === "unlock") {
      if (hero.unlocked) {
        return {
          alreadyUnlocked: true,
          coins: Number(player.coins),
          hero: { level: hero.level, shards: hero.shards, unlocked: true },
        };
      }
      const cost = heroConfig.unlock_fragments;
      if (hero.shards < cost) throw new AppError(409, "INSUFFICIENT_SHARDS", `需要 ${cost} 片英雄碎片`);
      const shards = hero.shards - cost;
      await tx
        .update(heroProgress)
        .set({ shards, unlocked: true })
        .where(and(eq(heroProgress.playerId, playerId), eq(heroProgress.heroKey, heroKey)));
      return {
        alreadyUnlocked: false,
        coins: Number(player.coins),
        hero: { level: hero.level, shards, unlocked: true },
      };
    }

    if (!hero.unlocked) throw new AppError(409, "HERO_LOCKED", "英雄尚未解锁");
    const current = gameConfig.levels[hero.level];
    const next = gameConfig.levels[hero.level + 1];
    if (!current || !next || current.can_upgrade !== 1) {
      throw new AppError(409, "MAX_LEVEL", "该英雄已达到最高等级");
    }
    const goldCost = current.next_level_gold;
    const shardCost = current.next_level_fragments;
    if (Number(player.coins) < goldCost) throw new AppError(409, "INSUFFICIENT_COINS", "金币不足");
    if (hero.shards < shardCost) throw new AppError(409, "INSUFFICIENT_SHARDS", "英雄碎片不足");

    const coins = Number(player.coins) - goldCost;
    const shards = hero.shards - shardCost;
    await tx.update(players).set({ coins }).where(eq(players.id, playerId));
    await tx
      .update(heroProgress)
      .set({ level: hero.level + 1, shards })
      .where(and(eq(heroProgress.playerId, playerId), eq(heroProgress.heroKey, heroKey)));
    return {
      alreadyMax: false,
      coins,
      hero: { level: hero.level + 1, shards, unlocked: true },
    };
  });
}

export async function registerHeroRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: Static<typeof HeroBody> }>(
    "/heroes/unlock",
    { schema: { body: HeroBody, tags: ["heroes"], summary: "Unlock a hero by consuming fragments" } },
    async (request) => {
      const playerId = await requirePlayerId(request);
      if (!request.body.heroKey) return badRequest("MISSING_HERO_KEY", "缺少 heroKey");
      return { data: await transactionHero(playerId, request.body.heroKey, "unlock") };
    },
  );

  app.post<{ Body: Static<typeof HeroBody> }>(
    "/heroes/upgrade",
    { schema: { body: HeroBody, tags: ["heroes"], summary: "Upgrade an unlocked hero" } },
    async (request) => {
      const playerId = await requirePlayerId(request);
      if (!request.body.heroKey) return badRequest("MISSING_HERO_KEY", "缺少 heroKey");
      return { data: await transactionHero(playerId, request.body.heroKey, "upgrade") };
    },
  );
}
