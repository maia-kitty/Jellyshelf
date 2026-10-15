import type { User } from "@/db/schema";
import { JellyfinLogin } from "./JellyfinLogin";

/** Shown where something needs the viewer's own Jellyfin session (playing, browsing their library). */
export function PlaybackSignIn({ user, what = "watch" }: { user: User; what?: string }) {
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="card p-6">
        <h1 className="mb-1 text-lg font-semibold">Sign in with Jellyfin to {what}</h1>
        <p className="mb-4 text-sm text-muted">
          Jellyshelf plays and browses as your own Jellyfin account, so progress and watched state land in the right place.
          {user.jellyfinUserId ? " Enter your Jellyfin password once more to turn it on." : " This links your Jellyfin account to Jellyshelf."}
        </p>
        <JellyfinLogin stay label="Continue" />
      </div>
    </div>
  );
}
