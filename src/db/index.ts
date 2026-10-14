import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export const CONFIG_DIR = process.env.CONFIG_DIR ?? path.join(process.cwd(), "config");

function open() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const client = createClient({ url: `file:${path.join(CONFIG_DIR, "kitsune.db")}` });
  return drizzle(client, { schema });
}

// Survive Next.js dev hot reloads without opening a new connection each time.
const g = globalThis as unknown as { __kitsuneDb?: ReturnType<typeof open>; __kitsuneMigrated?: Promise<void> };
export const db = (g.__kitsuneDb ??= open());

export function ensureMigrated() {
  return (g.__kitsuneMigrated ??= (async () => {
    await db.run("PRAGMA journal_mode = WAL");
    await db.run("PRAGMA foreign_keys = ON");
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  })());
}

export { schema };
