import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { createOrGetPlayer } from "../services/player.js";
import { exchangePlatformCode } from "../lib/platform.js";
import { badRequest, forbidden } from "../lib/errors.js";

const LoginBody = Type.Object({
  provider: Type.Union([Type.Literal("wx"), Type.Literal("tt"), Type.Literal("dev")]),
  code: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
  devId: Type.Optional(Type.String({ minLength: 8, maxLength: 128 })),
});

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: Static<typeof LoginBody> }>(
    "/auth/login",
    {
      schema: { body: LoginBody, tags: ["auth"], summary: "Platform or development login" },
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (request) => {
      const { provider, code, devId } = request.body;
      let platformUid: string;
      if (provider === "dev") {
        if (env.isProduction) return forbidden("正式环境禁止开发游客登录");
        platformUid = devId ?? `web-${randomUUID()}`;
      } else {
        if (!code) return badRequest("MISSING_PLATFORM_CODE", "缺少平台登录 code");
        platformUid = await exchangePlatformCode(
          provider,
          code,
          provider === "wx"
            ? { appId: env.wxAppId, appSecret: env.wxAppSecret }
            : { appId: env.ttAppId, appSecret: env.ttAppSecret },
        );
      }
      const account = await createOrGetPlayer({ provider, platformUid });
      const token = app.jwt.sign(
        { sub: String(account.playerId), provider, aud: "player" },
        { expiresIn: "7d" },
      );
      return {
        data: {
          token,
          playerId: account.publicId,
          created: account.created,
          expiresIn: 7 * 24 * 60 * 60,
        },
      };
    },
  );
}
