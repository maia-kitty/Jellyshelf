# Jellyshelf

Formerly Kitsune: an existing `config/kitsune.db`, old sessions and `KITSUNE_*` env vars are picked up automatically.

A self-hosted front end for Jellyfin that also handles requests, Seerr-style, and treats **anime as a first-class
citizen**. You sign in with your Jellyfin account, browse, request, and watch, all in one place.

- **Watch:** your Jellyfin library, with continue watching and a built-in player. The player supports direct play or
  transcoding, styled anime subtitles, skip intro and up next. Video streams through Jellyshelf.
- **Request:** movies go to Radarr and series go to Sonarr, using TMDB metadata. Anime is browsed through AniList
  (trending, seasonal, airing schedule) and sent to the exact Sonarr season or episode range. Anime films go to Radarr.
- **AniList (optional add-on):** link it to see your list status on every card, edit entries, and have episodes marked
  as watched automatically at 90%.
- **Subtitles:** shown per episode, with fixes through Bazarr.

**Changing things yourself:** see [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md), a plain-language guide to how the
project is laid out and how to make, test and undo a change.

## How anime mapping works

AniList IDs are mapped to TVDB/TMDB using [Fribb/anime-lists](https://github.com/Fribb/anime-lists), which provides the cross-site IDs, and
[Anime-Lists/anime-lists](https://github.com/Anime-Lists/anime-lists), which provides the TVDB season and episode offset. Both are refreshed
daily. For example:

| AniList entry | Goes to |
|---|---|
| Attack on Titan S3 Part 2 | Sonarr TVDB 267440, season 3, episodes 13–22 only |
| Frieren | Sonarr, season 1 (whole season) |
| One Piece | Sonarr, absolute numbering, whole series |
| Your Name. | Radarr, TMDB 372058 |

When a season is shared between several AniList entries (split cours), only that entry's episodes are monitored. If a mapping is wrong,
admins can override it on the anime page.

## Running

```sh
docker compose -f docker-compose.example.yml up -d --build   # → http://localhost:3000
# or, for development
npm install && npm run dev
```

The setup wizard asks for:
1. The public URL, a TMDB key and an AniList API client. Create the client at https://anilist.co/settings/developer, with redirect
   URL `<public url>/api/auth/anilist/callback`.
2. Jellyfin, then the first sign-in with a Jellyfin account. That account becomes the admin.
3. Jellyfin, Sonarr, Radarr and (optionally) Bazarr connection details.

All state lives in `/config` (`CONFIG_DIR`): the SQLite database plus the generated session/encryption secret.
The app runs as user 1000:1000 (set `PUID`/`PGID` to match whoever owns your config folder); on start it hands
`/config` to that user, so installs from when it ran as root carry on as they are.

## Development

- `npm test`: unit tests (mapping resolver against real mapping data, playback, subtitles, image sizing, …)
- `npm run typecheck`
- `npm run db:generate`: create a migration after editing `src/db/schema.ts`. Migrations run automatically on boot.
- `JELLYSHELF_DISABLE_JOBS=1` disables the background jobs (mapping refresh daily, availability sync every 10 min).
