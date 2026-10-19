import { Cron } from "croner";
import { refreshMappings, mappingCount } from "@/lib/mapping";
import { runAvailabilitySync } from "./availability";
import { backupDatabase } from "./backup";

const g = globalThis as unknown as { __jellyshelfJobs?: Cron[] };

async function safe(name: string, fn: () => Promise<unknown>) {
  const t = Date.now();
  try {
    const r = await fn();
    console.info(`[job:${name}] done in ${Date.now() - t}ms`, typeof r === "object" ? JSON.stringify(r) : (r ?? ""));
  } catch (e) {
    console.error(`[job:${name}] failed:`, e instanceof Error ? e.message : e);
  }
}

export const jobs = {
  mappings: () => safe("mappings", async () => `${await refreshMappings()} rows`),
  availability: () => safe("availability", runAvailabilitySync),
  backup: () => safe("backup", backupDatabase),
};

export function startJobs() {
  if (g.__jellyshelfJobs) return;
  g.__jellyshelfJobs = [
    new Cron("17 4 * * *", jobs.mappings), // daily
    new Cron("*/10 * * * *", jobs.availability, { protect: true }),
    new Cron("43 3 * * *", jobs.backup), // nightly
  ];
  // First boot: load mappings right away so anime requests work.
  void (async () => {
    if ((await mappingCount()) === 0) await jobs.mappings();
    await jobs.availability();
  })();
}
