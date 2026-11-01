<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/icon-mono-white.svg">
    <img src="assets/icon-mono.svg" alt="Jellyshelf" width="96">
  </picture>
</p>

<h1 align="center">Jellyshelf</h1>

<p align="center">
  A self-hosted front end for Jellyfin that also handles requests, Seerr-style,<br>
  and treats <b>anime as a first-class citizen</b>.
</p>

> [!NOTE]
> **This is a personal, vibe-coded project.** I built it for my own server and household, mostly by steering an AI
> coding assistant rather than writing the code by hand. It works well for me, but expect rough edges, opinionated
> choices and breaking changes without warning. Issues and ideas are welcome, but I can't promise support. Use it at your
> own risk, and keep backups.

You sign in with your Jellyfin account, then browse, request and watch, all in one place.

## Features

- **Watch:** your Jellyfin library, with continue watching and a built-in player. The player supports direct play or
  transcoding, styled anime subtitles, skip intro and up next. Video streams through Jellyshelf.
- **Request:** movies go to Radarr and series go to Sonarr, using TMDB metadata. Anime is browsed through AniList
  (trending, seasonal, airing schedule) and sent to the exact Sonarr season or episode range. Anime films go to Radarr.
- **AniList (optional):** link your account to see your list status on every card, edit entries, and have episodes
  marked as watched automatically at 90%.
- **Subtitles:** shown per episode, with fixes through Bazarr.
- **Stream now (anime):** don't want to wait for a download? Anime pages can play an episode straight away from the
  same source [ani-cli](https://github.com/pystardust/ani-cli) uses, with English subtitles and a subbed/dubbed switch.
  "Other sources" opens [FMHY](https://fmhy.net)'s anime list (movie and series pages get the same as "Don't want to
  wait?") and copies the title, ready to paste into a site's search.
- **Manga (optional):** browse and search manga on AniList (Browse → Manga), request a series (every chapter, or from
  a chapter on, say where the anime ends) and read it in the built-in reader. Requests go through the same approval
  as everything else, with their own auto-approve switch. Downloads are done by
  [Mangarr](https://github.com/maia-kitty/mangarr), a Sonarr-style app for manga I built alongside this; set it up in
  Settings → Mangarr. With AniList linked, finishing a chapter moves your AniList progress, the manga's page picks up
  where you left off ("Continue ch. N"), and Discover gets a "Continue reading" row.
- **Android app:** your server full screen as an app, plus offline: download manga chapters, episodes and films, read
  and watch them with no connection (styled anime subtitles included), and progress syncs back once you're online. See
  [android/README.md](android/README.md).

## How anime mapping works

AniList IDs are mapped to TVDB/TMDB using [Fribb/anime-lists](https://github.com/Fribb/anime-lists), which provides the
cross-site IDs, and [Anime-Lists/anime-lists](https://github.com/Anime-Lists/anime-lists), which provides the TVDB
season and episode offset. Both are refreshed daily. For example:

| AniList entry | Goes to |
|---|---|
| Attack on Titan S3 Part 2 | Sonarr TVDB 267440, season 3, episodes 13–22 only |
| Frieren | Sonarr, season 1 (whole season) |
| One Piece | Sonarr, absolute numbering, whole series |
| Your Name. | Radarr, TMDB 372058 |

When a season is shared between several AniList entries (split cours), only that entry's episodes are monitored. If a
mapping is wrong, admins can override it on the anime page.

## Getting started

```sh
docker compose -f docker-compose.example.yml up -d --build   # → http://localhost:3000
# or, for development
npm install && npm run dev
```

The setup wizard asks for:

1. The public URL, a TMDB key and an AniList API client. Create the client at https://anilist.co/settings/developer,
   with redirect URL `<public url>/api/auth/anilist/callback`.
2. Jellyfin, then the first sign-in with a Jellyfin account. That account becomes the admin.
3. Jellyfin, Sonarr, Radarr and (optionally) Bazarr connection details. Mangarr, for manga, is set up later in
   Settings → Mangarr.

### Data and backups

All state lives in `/config` (`CONFIG_DIR`): the SQLite database plus the generated session/encryption secret. The
database is copied to `/config/backups` every night (the last 7 are kept). To restore one, stop the container, delete
`jellyshelf.db-wal` and `jellyshelf.db-shm`, and copy the backup over `jellyshelf.db`.

The app runs as user 1000:1000 (set `PUID`/`PGID` to match whoever owns your config folder). On start it hands
`/config` to that user, so installs from when it ran as root carry on as they are.

## Development

- `npm test`: unit tests (mapping resolver against real mapping data, playback, subtitles, image sizing, …)
- `npm run typecheck`
- `npm run db:generate`: create a migration after editing `src/db/schema.ts`. Migrations run automatically on boot.
- `JELLYSHELF_DISABLE_JOBS=1` disables the background jobs (mapping refresh daily, availability sync every 10 min,
  database backup nightly).

New to the code? [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md) is a plain-language guide to how the project is laid out
and how to make, test and undo a change.

## Credits

Jellyshelf is mostly glue. It wouldn't be possible without these projects:

- [Jellyfin](https://jellyfin.org): the media server everything is built around.
- The *arr stack: [Sonarr](https://sonarr.tv), [Radarr](https://radarr.video) and [Bazarr](https://www.bazarr.media)
  do the actual finding, downloading and subtitling; [qBittorrent](https://www.qbittorrent.org) shows download progress.
- [Mangarr](https://github.com/maia-kitty/mangarr) and [Suwayomi-Server](https://github.com/Suwayomi/Suwayomi-Server):
  the manga downloads, from the same sources [Mihon](https://mihon.app) uses.
- [Overseerr](https://overseerr.dev) / [Jellyseerr](https://github.com/fallenbagel/jellyseerr): the inspiration for how
  requests work.
- [ani-cli](https://github.com/pystardust/ani-cli): showed the way for Stream now.
- [FMHY](https://fmhy.net): the "Other sources" / "Don't want to wait?" links.
- [AniList](https://anilist.co) and [TMDB](https://www.themoviedb.org): metadata, artwork and lists.
- [Fribb/anime-lists](https://github.com/Fribb/anime-lists) and
  [Anime-Lists/anime-lists](https://github.com/Anime-Lists/anime-lists): the anime ID mappings.

This product uses the TMDB API but is not endorsed or certified by TMDB.

## License

[MIT](LICENSE). Do whatever you like with it.
