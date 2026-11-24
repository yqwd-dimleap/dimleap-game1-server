import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import { pool } from "./db/client.js";
import { env } from "./config/env.js";
import { gameConfig } from "./config/game.js";
import { AppError } from "./lib/errors.js";
import { OptionalRedis } from "./lib/redis.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerBattleRoutes } from "./routes/battles.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerHeroRoutes } from "./routes/heroes.js";
import { registerLeaderboardRoutes } from "./routes/leaderboard.js";
import { registerPlayerRoutes } from "./routes/player.js";
import { registerSeasonRoutes } from "./routes/season.js";

interface BuildOptions {
  logger?: boolean;
}

export async function buildApp(options: BuildOptions = {}): Promise<FastifyInstance> {
  const useLogger = options.logger ?? true;
  const app = Fastify({
    logger: useLogger
      ? env.isProduction
        ? true
        : { transport: { target: "pino-pretty", options: { translateTime: "SYS:standard", ignore: "pid,hostname" } } }
      : false,
    trustProxy: true,
    bodyLimit: 64 * 1024,
    requestTimeout: 15_000,
  });

  const cache = new OptionalRedis(env.redisUrl, app.log);

  await app.register(cors, {
    origin: env.isProduction ? env.corsOrigins : true,
    methods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"],
    allowedHeaders: ["content-type", "authorization"],
  });
  await app.register(rateLimit, { global: true, max: 180, timeWindow: "1 minute" });
  await app.register(jwt, { secret: env.jwtSecret });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Runestone Server API",
        description: "Lightweight backend for the AI-only casual mini game.",
        version: "0.1.0",
      },
      servers: [{ url: "/" }],
    },
  });
  if (!env.isProduction) {
    await app.register(swaggerUi, { routePrefix: "/docs" });
  }

  app.setErrorHandler((error, request, reply) => {
    const typedError = error as Error & { validation?: unknown; statusCode?: number };
    if (typedError instanceof AppError) {
      return reply.code(typedError.statusCode).send({
        requestId: request.id,
        code: typedError.code,
        message: typedError.message,
      });
    }
    if (typedError.validation) {
      return reply.code(400).send({
        requestId: request.id,
        code: "VALIDATION_ERROR",
        message: "请求参数不合法",
        details: typedError.validation,
      });
    }
    const statusCode = typedError.statusCode && typedError.statusCode >= 400 ? typedError.statusCode : 500;
    if (statusCode >= 500) request.log.error({ err: typedError }, "Request failed");
    return reply.code(statusCode).send({
      requestId: request.id,
      code: statusCode >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
      message: statusCode >= 500 ? "服务器内部错误" : typedError.message,
    });
  });
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      requestId: request.id,
      code: "ROUTE_NOT_FOUND",
      message: "接口不存在",
    }),
  );

  await registerHealthRoutes(app, cache);
  await app.register(
    async (api) => {
      await registerAuthRoutes(api);
      await registerPlayerRoutes(api);
      await registerHeroRoutes(api);
      await registerBattleRoutes(api);
      await registerSeasonRoutes(api);
      await registerLeaderboardRoutes(api, cache);
    },
    { prefix: "/api/v1" },
  );

  app.get("/", async () => ({
    name: "runestone-server",
    version: "0.1.0",
    docs: env.isProduction ? undefined : "/docs",
    configVersion: gameConfig.configVersion,
  }));

  await cache.connect();
  app.addHook("onClose", async () => {
    await cache.close();
    await pool.end();
  });
  return app;
}
