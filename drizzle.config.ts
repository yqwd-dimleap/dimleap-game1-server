import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "mysql://runestone:runestone_dev_password@127.0.0.1:3306/runestone",
  },
  strict: true,
  verbose: true,
});
