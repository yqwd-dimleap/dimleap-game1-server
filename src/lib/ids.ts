import { env } from "../config/env.js";
import { SnowflakeGenerator } from "./snowflake.js";

export const playerIdGenerator = new SnowflakeGenerator(env.snowflakeWorkerId, env.snowflakeDatacenterId);
