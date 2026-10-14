export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureMigrated } = await import("@/db");
  await ensureMigrated();
  if (process.env.KITSUNE_DISABLE_JOBS !== "1") {
    const { startJobs } = await import("@/lib/jobs");
    startJobs();
  }
}
