import { Type, type Static } from "@sinclair/typebox";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { heroProgress, players } from "../db/schema.js";
import { gameConfig } from "../config/game.js";
import { requirePlayerId } from "../lib/auth.js";
import { badRequest } from "../lib/errors.js";
import { playerSnapshot, updatePlayerProfile } from "../services/player.js";

const ProfileBody = Type.Object({
  nickname: Type.Optional(Type.String({ minLength: 1, maxLength: 19 })),
  avatarId: Type.Optional(Type.Integer({ minimum: 1, maximum: 8 })),
});

const LineupBody = Type.Object({
  lineup: Type.Array(Type.Union([Type.String({ minLength: 1, maxLength: 32 }), Type.Null()]), {
    minItems: 5,
    maxItems: 5,
  }),
});

export async function registerPlayerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/player/bootstrap", { schema: { tags: ["player"], summary: "Load cloud player state" } }, async (request) => {
    const playerId = await requirePlayerId(request);
    return { data: await playerSnapshot(playerId) };
  });

  app.patch<{ Body: Static<typeof ProfileBody> }>(
    "/player/profile",
    { schema: { body: ProfileBody, tags: ["player"], summary: "Update nickname or avatar" } },
    async (request) => {
      const playerId = await requirePlayerId(request);
      const nickname = request.body.nickname?.trim();
      if (nickname !== undefined && (!nickname || Array.from(nickname).length > 19)) {
        return badRequest("INVALID_NICKNAME", "昵称长度必须为 1–19 个字符");
      }
      if (nickname === undefined && request.body.avatarId === undefined) {
        return badRequest("EMPTY_PROFILE_UPDATE", "没有需要修改的玩家资料");
      }
      await updatePlayerProfile(playerId, {
        ...(nickname !== undefined ? { nickname } : {}),
        ...(request.body.avatarId !== undefined ? { avatarId: request.body.avatarId } : {}),
      });
      return { data: await playerSnapshot(playerId) };
    },
  );

  app.put<{ Body: Static<typeof LineupBody> }>(
    "/player/lineup",
    { schema: { body: LineupBody, tags: ["player"], summary: "Replace the five-slot lineup" } },
    async (request) => {
      const playerId = await requirePlayerId(request);
      const lineup = request.body.lineup;
      const chosen = lineup.filter((value): value is string => value !== null);
      if (new Set(chosen).size !== chosen.length) {
        return badRequest("DUPLICATE_HERO", "阵容中不能重复英雄");
      }
      for (const heroKey of chosen) {
        if (!gameConfig.heroByKey(heroKey)) return badRequest("UNKNOWN_HERO", `未知英雄：${heroKey}`);
      }
      if (chosen.length) {
        const rows = await db
          .select({ heroKey: heroProgress.heroKey, unlocked: heroProgress.unlocked })
          .from(heroProgress)
          .where(and(eq(heroProgress.playerId, playerId), eq(heroProgress.unlocked, true)));
        const unlocked = new Set(rows.map((row) => row.heroKey));
        if (chosen.some((heroKey) => !unlocked.has(heroKey))) {
          return badRequest("HERO_LOCKED", "阵容包含尚未解锁的英雄");
        }
      }
      await db.update(players).set({ lineupJson: lineup }).where(eq(players.id, playerId));
      return { data: await playerSnapshot(playerId) };
    },
  );
}
