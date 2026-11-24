import { Type, type Static } from "@sinclair/typebox";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { gameConfig } from "../config/game.js";
import { db } from "../db/client.js";
import { heroProgress, players, rewardClaims } from "../db/schema.js";
import { requirePlayerId } from "../lib/auth.js";
import { AppError, badRequest } from "../lib/errors.js";

const ClaimBody = Type.Object({
  rewardId: Type.Integer({ minimum: 1 }),
});

export async function registerSeasonRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: Static<typeof ClaimBody> }>(
    "/season/rewards/claim",
    { schema: { body: ClaimBody, tags: ["season"], summary: "Claim a merit milestone reward" } },
    async (request) => {
      const playerId = await requirePlayerId(request);
      const milestone = gameConfig.meritReward(request.body.rewardId);
      if (!milestone) return badRequest("UNKNOWN_MERIT_REWARD", "未知军功奖励");

      try {
        return await db.transaction(async (tx) => {
          const [selected] = await tx.select().from(players).where(eq(players.id, playerId)).for("update").limit(1);
          if (!selected) throw new AppError(404, "PLAYER_NOT_FOUND", "玩家不存在");
          let player = selected;
          if (
            player.seasonId !== gameConfig.rules.seasonId ||
            player.configVersion !== gameConfig.configVersion
          ) {
            const seasonChanged = player.seasonId !== gameConfig.rules.seasonId;
            await tx
              .update(players)
              .set({
                ...(seasonChanged
                  ? { netStars: 0, merit: 0, seasonId: gameConfig.rules.seasonId }
                  : {}),
                configVersion: gameConfig.configVersion,
              })
              .where(eq(players.id, playerId));
            player = {
              ...player,
              ...(seasonChanged
                ? { netStars: 0, merit: 0, seasonId: gameConfig.rules.seasonId }
                : {}),
              configVersion: gameConfig.configVersion,
            };
          }
          if (player.merit < milestone.requiredMerit) {
            throw new AppError(409, "MERIT_NOT_ENOUGH", `需要 ${milestone.requiredMerit} 军功`);
          }
          const [claimed] = await tx
            .select({ rewardId: rewardClaims.rewardId })
            .from(rewardClaims)
            .where(
              and(
                eq(rewardClaims.playerId, playerId),
                eq(rewardClaims.seasonId, player.seasonId),
                eq(rewardClaims.rewardType, "merit"),
                eq(rewardClaims.rewardId, String(milestone.id)),
              ),
            )
            .limit(1);
          if (claimed) throw new AppError(409, "REWARD_ALREADY_CLAIMED", "该军功奖励已经领取");

          await tx.insert(rewardClaims).values({
            playerId,
            seasonId: player.seasonId,
            rewardType: "merit",
            rewardId: String(milestone.id),
          });

          let coins = Number(player.coins);
          const granted: { itemId: number; name: string; amount: number; heroKey?: string }[] = [];
          for (const item of milestone.items) {
            const itemConfig = gameConfig.items[item.id];
            if (!itemConfig) throw new AppError(500, "INVALID_REWARD_CONFIG", "奖励配置无效");
            if (itemConfig.item_type === "currency") {
              if (item.id !== 1) throw new AppError(500, "UNSUPPORTED_CURRENCY", "服务端暂不支持该货币");
              coins += item.amount;
              granted.push({ itemId: item.id, name: itemConfig.name, amount: item.amount });
              continue;
            }
            const hero = gameConfig.heroByFragmentItemId[item.id];
            if (!hero) throw new AppError(500, "INVALID_FRAGMENT_ITEM", "英雄碎片配置无效");
            const [progress] = await tx
              .select()
              .from(heroProgress)
              .where(and(eq(heroProgress.playerId, playerId), eq(heroProgress.heroKey, hero.key)))
              .for("update")
              .limit(1);
            if (!progress) throw new AppError(500, "HERO_PROGRESS_MISSING", "英雄进度缺失");
            await tx
              .update(heroProgress)
              .set({ shards: progress.shards + item.amount })
              .where(and(eq(heroProgress.playerId, playerId), eq(heroProgress.heroKey, hero.key)));
            granted.push({
              itemId: item.id,
              name: itemConfig.name,
              amount: item.amount,
              heroKey: hero.key,
            });
          }
          await tx.update(players).set({ coins }).where(eq(players.id, playerId));
          return {
            data: {
              rewardId: milestone.id,
              claimed: true,
              coins,
              granted,
              claimedMilestoneIds: [
                ...(
                  await tx
                    .select({ rewardId: rewardClaims.rewardId })
                    .from(rewardClaims)
                    .where(
                      and(
                        eq(rewardClaims.playerId, playerId),
                        eq(rewardClaims.seasonId, player.seasonId),
                        eq(rewardClaims.rewardType, "merit"),
                      ),
                    )
                ).map((row) => row.rewardId),
              ],
            },
          };
        });
      } catch (error) {
        if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
          throw new AppError(409, "REWARD_ALREADY_CLAIMED", "该军功奖励已经领取");
        }
        throw error;
      }
    },
  );
}
