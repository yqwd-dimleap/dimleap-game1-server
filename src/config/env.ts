import "dotenv/config";

function readRequired(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function readOptional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const nodeEnv = readOptional("NODE_ENV") ?? "development";
const port = Number(readOptional("PORT") ?? "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port");
const databaseUrl = readRequired("DATABASE_URL");
const redisUrl = readOptional("REDIS_URL");
const snowflakeWorkerId = Number(readOptional("SNOWFLAKE_WORKER_ID") ?? "1");
const snowflakeDatacenterId = Number(readOptional("SNOWFLAKE_DATACENTER_ID") ?? "1");
if (!Number.isInteger(snowflakeWorkerId) || snowflakeWorkerId < 0 || snowflakeWorkerId > 31) {
  throw new Error("SNOWFLAKE_WORKER_ID must be an integer from 0 to 31");
}
if (!Number.isInteger(snowflakeDatacenterId) || snowflakeDatacenterId < 0 || snowflakeDatacenterId > 31) {
  throw new Error("SNOWFLAKE_DATACENTER_ID must be an integer from 0 to 31");
}

const jwtSecret = readRequired("JWT_SECRET");
if (nodeEnv === "production") {
  if (jwtSecret.length < 32 || /replace|change[-_ ]?me|example/i.test(jwtSecret)) {
    throw new Error("JWT_SECRET must be a random value of at least 32 characters in production");
  }
  let parsedDatabaseUrl: URL;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid URL");
  }
  if (
    parsedDatabaseUrl.protocol !== "mysql:" ||
    !parsedDatabaseUrl.username ||
    !parsedDatabaseUrl.password ||
    /runestone_dev_password|runestone_root_password|change[-_ ]?me|example/i.test(parsedDatabaseUrl.password)
  ) {
    throw new Error("DATABASE_URL credentials must be replaced before production deployment");
  }
}

export const env = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === "production",
  host: readOptional("HOST") ?? "0.0.0.0",
  port,
  databaseUrl,
  redisUrl,
  snowflakeWorkerId,
  snowflakeDatacenterId,
  jwtSecret,
  corsOrigins: (readOptional("CORS_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  allowGuestLogin: readOptional("ALLOW_GUEST_LOGIN") === "true",
  seasonId: readOptional("SEASON_ID"),
  wxAppId: readOptional("WX_APP_ID"),
  wxAppSecret: readOptional("WX_APP_SECRET"),
  ttAppId: readOptional("TT_APP_ID"),
  ttAppSecret: readOptional("TT_APP_SECRET"),
});

export type Env = typeof env;
