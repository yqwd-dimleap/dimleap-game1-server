import { Type, type Static } from "@sinclair/typebox";
import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { gameConfig } from "../config/game.js";
import { db } from "../db/client.js";
import { battleResults, players } from "../db/schema.js";
import { requirePlayerId, type BattleTicketPayload } from "../lib/auth.js";
import { AppError, badRequest, conflict, unauthorized } from "../lib/errors.js";
import { loadCurrentPlayer } from "../services/player.js";

const StartBody = Type.Object({
  configVersion: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
});

const FinishBody = Type.Object({
  ticket: Type.String({ minLength: 20, maxLength: 8192 }),
  result: Type.Union([Type.Literal("win"), Type.Literal("loss")]),
});

function mapForBattle(battleId: string): { mapId: string; zoneSeed: number } {
  const digest = createHash("sha256").update(battleId).digest();
  const row = (digest[0]! % 5) + 1;
  const column = (digest[1]! % 5) + 1;
  const zoneSeed = digest.readUInt32LE(2);
  return { mapId: `map_${row}_${column}`, zoneSeed };
}

export async function registerBattleRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: Static<typeof StartBody> }>(
    "/battles/start",
    {
      schema: {
        body: StartBody,
        tags: ["battle"],
        summary: "Issue a signed battle ticket and server-selected AI difficulty",
      },
    },
    async (request) => {
      const playerId = await requirePlayerId(request);
      const player = await loadCurrentPlayer(playerId);
      if (request.body.configVersion && request.body.configVersion !== gameConfig.configVersion) {
        throw conflict("CONFIG_VERSION_MISMATCH", "客户端配置版本与服务器不一致，请更新后重试");
      }

      const battleId = randomUUID();
      const startedAt = Date.now();
      const difficulty = gameConfig.difficultyForStars(player.netStars);
      const rank = gameConfig.rankForStars(player.netStars);
      const ticket = app.jwt.sign(
        {
          sub: String(playerId),
          aud: "battle",
          battleId,
          difficultyId: difficulty.difficultyId,
          configVersion: gameConfig.configVersion,
          startedAt,
        },
        { expiresIn: gameConfig.rules.battle.ticketTtlSeconds },
      );
      return {
        data: {
          battleId,
          ticket,
          configVersion: gameConfig.configVersion,
          rankId: rank.id,
          netStars: player.netStars,
          difficulty,
          map: mapForBattle(battleId),
        },
      };
    },
  );

  app.post<{ Body: Static<typeof FinishBody> }>(
    "/battles/finish",
    {
      schema: {
        body: FinishBody,
        tags: ["battle"],
        summary: "Settle a won or lost AI battle exactly once",
      },
    },
    async (request) => {
      const playerId = await requirePlayerId(request);
      let ticket: BattleTicketPayload;
      try {
        ticket = app.jwt.verify<BattleTicketPayload>(request.body.ticket);
      } catch {
        return unauthorized("对局票据无效或已过期");
      }
      if (ticket.aud !== "battle" || ticket.sub !== String(playerId) || !ticket.battleId) {
        return unauthorized("对局票据与当前玩家不匹配");
      }
      if (ticket.configVersion !== gameConfig.configVersion) {
        throw conflict("CONFIG_VERSION_MISMATCH", "对局使用了旧配置，不能结算");
      }

      if (!Number.isFinite(ticket.startedAt) || ticket.startedAt <= 0) {
        throw badRequest("INVALID_BATTLE_TICKET", "对局票据缺少有效开始时间");
      }
      if (!gameConfig.difficulties[ticket.difficultyId]) {
        throw badRequest("UNKNOWN_DIFFICULTY", "对局难度不存在");
      }

      const rewardRule =
        request.body.result === "win" ? gameConfig.rules.battle.win : gameConfig.rules.battle.loss;
      try {
        const response = await db.transaction(async (tx) => {
          const [player] = await tx.select().from(players).where(eq(players.id, playerId)).for("update").limit(1);
          if (!player) throw new AppError(404, "PLAYER_NOT_FOUND", "玩家不存在");
          const [existing] = await tx
            .select()
            .from(battleResults)
            .where(eq(battleResults.battleId, ticket.battleId))
            .limit(1);
          if (existing) {
            if (existing.playerId !== playerId) throw new AppError(409, "BATTLE_OWNER_MISMATCH", "对局不属于当前玩家");
            return {
              duplicate: true,
              reward: existing.rewardJson,
              player: {
                coins: Number(player.coins),
                netStars: player.netStars,
                matches: player.matches,
                merit: player.merit,
              },
            };
          }

          const durationMs = Date.now() - ticket.startedAt;
          if (
            durationMs < gameConfig.rules.battle.minimumDurationSeconds * 1000 ||
            durationMs > gameConfig.rules.battle.maximumDurationSeconds * 1000
          ) {
            throw conflict("BATTLE_DURATION_INVALID", "对局时长不符合结算条件");
          }
          const starsAfter = Math.max(0, player.netStars + rewardRule.stars);
          const reward = {
            result: request.body.result,
            coins: rewardRule.coins,
            starsDelta: starsAfter - player.netStars,
            merit: rewardRule.merit,
            starsBefore: player.netStars,
            starsAfter,
          };
          const finishedAt = new Date();
          await tx.insert(battleResults).values({
            battleId: ticket.battleId,
            playerId,
            result: request.body.result,
            difficultyId: ticket.difficultyId,
            configVersion: gameConfig.configVersion,
            starsBefore: player.netStars,
            starsAfter,
            rewardJson: reward,
            startedAt: new Date(ticket.startedAt),
            finishedAt,
          });
          const coins = Number(player.coins) + rewardRule.coins;
          const matches = player.matches + 1;
          const merit = player.merit + rewardRule.merit;
          await tx
            .update(players)
            .set({ coins, netStars: starsAfter, matches, merit })
            .where(eq(players.id, playerId));
          return {
            duplicate: false,
            reward,
            player: { coins, netStars: starsAfter, matches, merit },
          };
        });
        return { data: response };
      } catch (error) {
        if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
          const [existing] = await db
            .select()
            .from(battleResults)
            .where(eq(battleResults.battleId, ticket.battleId))
            .limit(1);
          const [player] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
          if (existing && player) {
            return {
              data: {
                duplicate: true,
                reward: existing.rewardJson,
                player: {
                  coins: Number(player.coins),
                  netStars: player.netStars,
                  matches: player.matches,
                  merit: player.merit,
                },
              },
            };
          }
        }
        throw error;
      }
    },
  );
}
