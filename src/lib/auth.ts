import type { FastifyRequest } from "fastify";
import { unauthorized } from "./errors.js";
import { MAX_SIGNED_INT64 } from "./snowflake.js";

export interface PlayerTokenPayload {
  sub: string;
  provider: string;
  aud: "player";
}

export interface BattleTicketPayload {
  sub: string;
  aud: "battle";
  battleId: string;
  difficultyId: number;
  configVersion: string;
  startedAt: number;
}

export async function requirePlayerId(request: FastifyRequest): Promise<bigint> {
  try {
    const payload = await request.jwtVerify<PlayerTokenPayload>();
    if (payload.aud !== "player" || typeof payload.sub !== "string" || !payload.sub) unauthorized();
    if (!/^[1-9]\d{0,19}$/.test(payload.sub)) unauthorized("玩家 ID 无效");
    const playerId = BigInt(payload.sub);
    if (playerId > MAX_SIGNED_INT64) unauthorized("玩家 ID 无效");
    return playerId;
  } catch {
    return unauthorized();
  }
}
