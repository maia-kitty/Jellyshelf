import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export const CONFIG_DIR = process.env.CONFIG_DIR ?? path.join(process.cwd(), "config");

const DB_FILE = path.join(CONFIG_DIR, "jellyshelf.db");
/** The app used to be called Kitsune; pick its database up (with SQLite's WAL/SHM side files) on first boot. */
const LEGACY_DB_FILE = path.join(CONFIG_DIR, "kitsune.db");

function adoptLegacyDb() {
  if (fs.existsSync(DB_FILE) || !fs.existsSync(LEGACY_DB_FILE)) return;
  for (const suffix of ["", "-wal", "-shm"]) {
    if (fs.existsSync(LEGACY_DB_FILE + suffix)) fs.renameSync(LEGACY_DB_FILE + suffix, DB_FILE + suffix);
  }
  console.info("[db] renamed kitsune.db → jellyshelf.db");
}

function open() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  adoptLegacyDb();
  const client = createClient({ url: `file:${DB_FILE}` });
  return drizzle(client, { schema });
}

type Db = ReturnType<typeof open>;

// Survive Next.js dev hot reloads without opening a new connection each time.
const g = globalThis as unknown as { __jellyshelfDb?: Db; __jellyshelfMigrated?: Promise<void> };

/**
 * Opened on first use, never at import: `next build` imports server modules to collect page data,
 * and opening here would create (or rename) database files in ./config at build time.
 */
export const db = new Proxy({} as Db, {
  get(_, key) {
    const real = (g.__jellyshelfDb ??= open());
    const value = Reflect.get(real, key, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export function ensureMigrated() {
  return (g.__jellyshelfMigrated ??= (async () => {
    await db.run("PRAGMA journal_mode = WAL");
    await db.run("PRAGMA foreign_keys = ON");
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  })());
}

export { schema };
