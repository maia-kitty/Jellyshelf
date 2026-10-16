import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { ensureMigrated } from "@/db";
import { startJobs } from "@/lib/jobs";

export async function registerNode() {
  // `next build` calls register() too; never migrate the real database or start jobs from a build.
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return;
  await ensureMigrated();
  if ((process.env.JELLYSHELF_DISABLE_JOBS ?? process.env.KITSUNE_DISABLE_JOBS) !== "1") startJobs();
}
