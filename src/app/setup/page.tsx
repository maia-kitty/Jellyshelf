import { redirect } from "next/navigation";
import { currentUser, isFirstUser } from "@/lib/auth";
import { getSettings, redactSettings } from "@/lib/settings";
import {
  AniListSettings,
  FinishSetup,
  GeneralSettings,
  JellyfinSettings,
  RadarrSettings,
  SonarrSettings,
  TmdbSettings,
} from "@/components/Settings";
import { JellyfinLogin } from "@/components/JellyfinLogin";

export default async function Setup() {
  const raw = await getSettings();
  if (raw.general.setupComplete) redirect("/");
  const user = await currentUser();
  const first = await isFirstUser();
  if (!user && !first) redirect("/login");
  if (user && user.role !== "admin") redirect("/");
  const s = redactSettings(raw);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-3xl font-bold">Set up Jellyshelf</h1>
      <p className="mb-8 text-muted">
        {user ? "Step 2 of 2 — connect your downloaders and media server." : "Step 1 of 2 — metadata sources and sign-in, then create the admin account."}
      </p>

      {!user ? (
        <>
          <GeneralSettings initial={s.general} />
          <TmdbSettings initial={s.tmdb} />
          <AniListSettings initial={s.anilist} appUrl={s.general.appUrl} />
          <JellyfinSettings initial={s.jellyfin} />
          <section className="card p-5">
            <h2 className="text-lg font-semibold">Create the admin account</h2>
            {raw.jellyfin.url && raw.jellyfin.allowLogin ? (
              <>
                <p className="mt-1 mb-4 text-sm text-muted">
                  Sign in with your Jellyfin account; the first account becomes the admin. You can link AniList to it afterwards.
                </p>
                <JellyfinLogin />
              </>
            ) : (
              <>
                <p className="mt-1 mb-4 text-sm text-muted">
                  The first account to sign in becomes the admin. Save the sections above first. Set up Jellyfin above to use Jellyfin accounts
                  (recommended); otherwise accounts come from AniList.
                </p>
                <a href="/api/auth/anilist" className="btn bg-anilist text-white hover:brightness-110">
                  Sign in with AniList
                </a>
              </>
            )}
          </section>
        </>
      ) : (
        <>
          <SonarrSettings initial={s.sonarr} />
          <RadarrSettings initial={s.radarr} />
          <JellyfinSettings initial={s.jellyfin} />
          <FinishSetup />
        </>
      )}
    </div>
  );
}
