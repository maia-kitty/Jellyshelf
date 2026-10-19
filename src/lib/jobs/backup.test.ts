import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { expect, it } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jellyshelf-backup-"));
process.env.CONFIG_DIR = dir;
const { backupDatabase } = await import("./backup");

it("copies the database and keeps only the last week", async () => {
  const backups = path.join(dir, "backups");
  fs.mkdirSync(backups);
  for (let d = 1; d <= 9; d++) fs.writeFileSync(path.join(backups, `jellyshelf-2020-01-0${d}.db`), "");
  fs.writeFileSync(path.join(backups, "something-else.db"), "");

  await backupDatabase();
  await backupDatabase(); // same day again: replaces, doesn't fail
  const today = `jellyshelf-${new Date().toISOString().slice(0, 10)}.db`;
  const left = fs.readdirSync(backups).sort();
  // 9 old + today's: the 3 oldest go, and files that aren't backups are left alone.
  const kept = ["04", "05", "06", "07", "08", "09"].map((d) => `jellyshelf-2020-01-${d}.db`);
  expect(left).toEqual([...kept, today, "something-else.db"].sort());

  const copy = createClient({ url: `file:${path.join(backups, today)}` });
  const tables = await copy.execute("select name from sqlite_master where type = 'table' and name = 'requests'");
  expect(tables.rows).toHaveLength(1);
  copy.close();
});
