import type { FastifyInstance } from "fastify";
import { gameConfig } from "../config/game.js";
import { pingDatabase } from "../db/client.js";
import { env } from "../config/env.js";
import type { OptionalRedis } from "../lib/redis.js";

export async function registerHealthRoutes(app: FastifyInstance, cache: OptionalRedis): Promise<void> {
  app.get("/health/live", { schema: { tags: ["health"] } }, async () => ({
    status: "ok",
    service: "runestone-server",
    timestamp: new Date().toISOString(),
  }));

  app.get("/health/ready", { schema: { tags: ["health"] } }, async (_request, reply) => {
    const database = await pingDatabase();
    const redis = await cache.ping();
    const status = database ? "ok" : "unavailable";
    if (!database) void reply.code(503);
    return {
      status,
      database,
      redis,
      redisOptional: true,
      configVersion: gameConfig.configVersion,
      seasonId: gameConfig.rules.seasonId,
      environment: env.nodeEnv,
      timestamp: new Date().toISOString(),
    };
  });
}
