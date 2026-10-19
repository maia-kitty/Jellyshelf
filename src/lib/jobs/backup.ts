import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { CONFIG_DIR, db, ensureMigrated } from "@/db";

const KEEP = 7;
const NAME = /^jellyshelf-\d{4}-\d{2}-\d{2}\.db$/;

/** Nightly copy of the database (all of Jellyshelf's state; secret.key beside it never changes), keeping the last week. */
export async function backupDatabase() {
  await ensureMigrated();
  const dir = path.join(CONFIG_DIR, "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `jellyshelf-${new Date().toISOString().slice(0, 10)}.db`);
  // VACUUM INTO won't overwrite, and a failed run shouldn't cost today's earlier copy: write beside it, then swap in.
  const tmp = `${file}.tmp`;
  fs.rmSync(tmp, { force: true });
  await db.run(sql`VACUUM INTO ${tmp}`);
  fs.renameSync(tmp, file);
  const old = fs.readdirSync(dir).filter((f) => NAME.test(f)).sort().slice(0, -KEEP);
  for (const f of old) fs.rmSync(path.join(dir, f));
  return `${path.basename(file)}${old.length ? `, removed ${old.join(", ")}` : ""}`;
}
