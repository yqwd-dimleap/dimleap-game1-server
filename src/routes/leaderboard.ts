import type { FastifyInstance } from "fastify";
import { requirePlayerId } from "../lib/auth.js";
import type { OptionalRedis } from "../lib/redis.js";
import { loadLeaderboard } from "../services/leaderboard.js";
import { loadCurrentPlayer } from "../services/player.js";

export async function registerLeaderboardRoutes(app: FastifyInstance, cache: OptionalRedis): Promise<void> {
  app.get("/leaderboard", { schema: { tags: ["leaderboard"], summary: "Current season top 100" } }, async (request) => {
    const playerId = await requirePlayerId(request);
    const player = await loadCurrentPlayer(playerId);
    const result = await loadLeaderboard(player, cache);
    return { data: { ...result, seasonId: player.seasonId } };
  });
}
