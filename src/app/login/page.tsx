import { redirect } from "next/navigation";
import { currentUser, isFirstUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { JellyfinLogin } from "@/components/JellyfinLogin";
import { IntroJar } from "@/components/JellySplash";
import { param, type SearchParams } from "@/lib/page";

const ERRORS: Record<string, string> = {
  oauth_state: "Sign-in expired or was tampered with. Try again.",
  oauth_exchange: "AniList rejected the sign-in. Check the client ID, secret and redirect URL in settings.",
  anilist_not_configured: "AniList sign-in isn't configured yet.",
  anilist_already_linked: "That AniList account is already linked to another user.",
};

export default async function Login({ searchParams }: { searchParams: SearchParams }) {
  if (await currentUser()) redirect("/");
  const s = await getSettings();
  if (!s.general.setupComplete && (await isFirstUser())) redirect("/setup");
  const error = param(await searchParams, "error");

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="mb-8 text-center">
        <IntroJar size={64} />
        <h1 className="mt-3 text-2xl font-bold">Jellyshelf</h1>
        <p className="text-sm text-muted">Request anime, movies and series</p>
      </div>
      <div className="card space-y-5 p-6">
        {error && <p className="text-sm text-bad">{ERRORS[error] ?? error}</p>}
        {s.anilist.clientId && (
          <a href="/api/auth/anilist" className="btn w-full bg-anilist text-white hover:brightness-110">
            Sign in with AniList
          </a>
        )}
        {s.anilist.clientId && s.jellyfin.url && s.jellyfin.allowLogin && (
          <div className="flex items-center gap-3 text-xs text-muted">
            <div className="h-px flex-1 bg-line" /> or <div className="h-px flex-1 bg-line" />
          </div>
        )}
        {s.jellyfin.url && s.jellyfin.allowLogin && <JellyfinLogin />}
      </div>
    </div>
  );
}
