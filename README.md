# Jellyshelf

Formerly Kitsune: an existing `config/kitsune.db`, old sessions and `KITSUNE_*` env vars are picked up automatically.

A Seerr-style request manager where **anime is a first-class citizen**. You sign in with AniList, your list status shows on every
card, and requesting an anime adds it to your AniList *Planning* list. Every AniList entry (season, cour, "Part 2") is mapped to the exact
Sonarr season or episode range, or to Radarr for films.

- **Movies** go to Radarr and **series** go to Sonarr, using TMDB metadata, the same as Seerr.
- **Anime** is browsed through AniList (trending, seasonal, search) and sent to Sonarr as series type *Anime*, with its own root folder
  and quality profile. Anime films go to Radarr.
- **Jellyfin** provides availability badges and optional Jellyfin-account sign-in.

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
2. The first sign-in, with AniList or Jellyfin. This account becomes the admin.
3. Sonarr, Radarr and Jellyfin connection details.

All state lives in `/config` (`CONFIG_DIR`): the SQLite database plus the generated session/encryption secret.

## Development

- `npm test`: mapping resolver tests against real mapping data fixtures
- `npm run typecheck`
- `npm run db:generate`: create a migration after editing `src/db/schema.ts`. Migrations run automatically on boot.
- `JELLYSHELF_DISABLE_JOBS=1` disables the background jobs (mapping refresh daily, availability sync every 10 min).
