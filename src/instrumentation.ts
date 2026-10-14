import { PHASE_PRODUCTION_BUILD } from "next/constants";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // `next build` calls register() too; never migrate the real database or start jobs from a build.
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return;
  const { ensureMigrated } = await import("@/db");
  await ensureMigrated();
  if ((process.env.JELLYSHELF_DISABLE_JOBS ?? process.env.KITSUNE_DISABLE_JOBS) !== "1") {
    const { startJobs } = await import("@/lib/jobs");
    startJobs();
  }
}
