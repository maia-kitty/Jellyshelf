import Link from "next/link";

const PERKS = [
  "Your Watching, Planning and Completed lists, right here",
  "Episodes marked watched on AniList as you finish them",
  "Status, progress and score from any anime page",
  "Your ratings sent to AniList with one tap",
];

/**
 * What My AniList shows before you've linked AniList: what you'd get, and the button to connect. If the server
 * hasn't been set up for AniList yet, it says so (and points an admin at the setting) instead of a button that fails.
 */
export function AniListConnect({ configured, admin }: { configured: boolean; admin: boolean }) {
  return (
    <div className="card rise-in mx-auto mt-2 max-w-md p-8 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-anilist/15 text-2xl font-black text-anilist">A</div>
      <h2 className="text-xl font-semibold">Connect your AniList</h2>
      <p className="mt-1.5 text-sm text-muted">Bring your anime lists into Jellyshelf and keep them in step as you watch.</p>
      <ul className="mx-auto mt-5 max-w-xs space-y-2 text-left text-sm">
        {PERKS.map((p) => (
          <li key={p} className="flex gap-2.5">
            <span className="text-anilist">✓</span>
            {p}
          </li>
        ))}
      </ul>
      {configured ? (
        <>
          {/* A plain link: the sign-in round trip is a full navigation. */}
          <a className="btn mt-7 w-full bg-anilist text-white hover:brightness-110" href="/api/auth/anilist">
            Connect AniList
          </a>
          <p className="mt-3 text-xs text-muted">You&apos;ll sign in on AniList and come straight back.</p>
        </>
      ) : admin ? (
        <p className="mt-7 text-sm text-muted">
          AniList isn&apos;t set up on this server yet.{" "}
          <Link className="text-anilist hover:underline" href="/settings?tab=anilist">
            Set it up in Settings
          </Link>
        </p>
      ) : (
        <p className="mt-7 text-sm text-muted">AniList isn&apos;t set up on this server yet. Ask whoever runs Jellyshelf to switch it on.</p>
      )}
    </div>
  );
}
