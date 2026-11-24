import { migrate } from "drizzle-orm/mysql2/migrator";
import path from "node:path";
import { db, pool } from "./client.js";

try {
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  console.log("Database migrations completed");
} finally {
  await pool.end();
}
