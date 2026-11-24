import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

export const pool = mysql.createPool({
  uri: env.databaseUrl,
  connectionLimit: 10,
  supportBigNumbers: true,
  bigNumberStrings: true,
  enableKeepAlive: true,
  timezone: "Z",
});

export const db = drizzle(pool, { schema, mode: "default" });
export type Database = typeof db;

export async function pingDatabase(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
