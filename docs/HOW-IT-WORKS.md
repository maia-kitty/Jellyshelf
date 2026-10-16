# How Jellyshelf works

A guide for changing things yourself without knowing TypeScript. It covers what the pieces are, where to find things,
how to make a safe change, and how to undo one.

---

## The big picture

Jellyshelf is one program that runs in one Docker container. Your browser talks only to Jellyshelf, and Jellyshelf
talks to everything else for you:

```
                        ┌──────────────► AniList    anime info, your list, auto-update at 90%
                        ├──────────────► TMDB       movie and series info, posters
  Your browser ───► Jellyshelf ────────► Sonarr     series and anime requests, download progress
  (phone, PC)      (localhost:3000)  ──► Radarr     movie requests
                        ├──────────────► Bazarr     subtitles
                        └──────────────► Jellyfin   sign-in, your library, video streaming
                        │
                        └── config/  its own memory: settings, users, requests, ratings (SQLite database)
```

Some consequences of this design:

- **Jellyfin is the backend for watching.** The video, your watch progress and your library all come from Jellyfin.
  Jellyshelf is a nicer front end on top of it. The built-in player streams through Jellyshelf, so your browser
  never needs to reach Jellyfin directly.
- **Nothing important lives only in Jellyshelf** apart from requests, ratings and settings, which are kept in
  `config/`. If the container is deleted and rebuilt, `config/` survives and nothing is lost.
- **Two things happen in the background:**
  - Every 10 minutes it asks Sonarr, Radarr and Jellyfin what's downloaded, and updates the "Available" badges.
  - Once a day it downloads the anime ID lists that map AniList to TVDB.

  Sonarr and Radarr can also notify it right away through a webhook (Settings → Jobs & webhooks shows the URL).

---

## The project folder

```
jellyshelf/
├── config/                     ← YOUR DATA. Never uploaded to GitHub. Back this up, don't edit it by hand.
├── docs/                       ← this guide
├── src/                        ← all the code (below)
├── drizzle/                    ← database upgrade steps; generated, don't edit
├── docker-compose.example.yml  ← how the container is run (port 3000, where config/ is mounted)
├── Dockerfile                  ← how the container is built
├── next.config.ts              ← framework settings (mainly image resizing)
└── package.json                ← the list of libraries the code uses
```

Inside `src/` there are four parts:

| Folder | What's in it | You'd go here to… |
|---|---|---|
| `src/app/` | **Pages.** Each folder is a URL: `src/app/requests/page.tsx` is `/requests`, and `src/app/anime/[id]/page.tsx` is `/anime/12345`. | change what a page shows, or in what order |
| `src/components/` | **Building blocks** used by pages: the nav bar, cards, the player, buttons, the spotlight banner… | change how a piece looks or behaves |
| `src/lib/` | **The brains.** Talking to the other services, request logic, anime mapping, playback. No visuals. | change rules, timings, thresholds |
| `src/app/globals.css` | **The theme.** Colours, button styles and animations. | change colours or animations |

`src/app/api/` is a special part of `src/app/`. It holds behind-the-scenes endpoints that the pages call, for example
"create a request" or "stream this video". It's rarely the place for a visual change.

### Where the main things live

| Thing on screen | File |
|---|---|
| Top bar and phone dock (links, icons, search) | `src/components/Nav.tsx` |
| Discover page (spotlight, rows, their order) | `src/app/page.tsx` |
| Spotlight banner at the top of Discover | `src/components/Spotlight.tsx` |
| Discover rows: Continue watching, Top 10, This week, On its way | `src/components/discover/` |
| Poster cards and sideways rows | `src/components/MediaCard.tsx` |
| Big header on a title's page (backdrop, poster, Play) | `src/components/Hero.tsx` |
| Anime / movie / series pages | `src/app/anime/[id]/page.tsx`, `src/app/movie/[id]/page.tsx`, `src/app/tv/[id]/page.tsx` |
| Episode list | `src/components/Episodes.tsx` |
| Request buttons and season picker | `src/components/RequestButtons.tsx` |
| Library pages | `src/app/library/` and `src/components/LibraryNav.tsx`, `LibraryControls.tsx`, `LibraryCard.tsx` |
| Video player | `src/components/player/Player.tsx` (and `SeekBar.tsx` in the same folder) |
| Settings page | `src/components/Settings.tsx` |
| The jelly jar loading animation | `src/components/AppIcon.tsx` |

You can also find things by their text: search the code for a word you can see on screen, such as "Trending anime".
In VS Code that's `Ctrl+Shift+F`; in a terminal, `grep -rn "Trending anime" src/`.

---

## Reading the code (just enough)

Most files you'd touch are `.tsx`, which is TypeScript with HTML-like tags mixed in. Here's a real piece of
`Nav.tsx`, annotated:

```tsx
const LINKS = [                                                    // a list…
  { href: "/", label: "Discover", icon: "discover", dock: true },  // …of links: URL, text, icon, in phone dock?
  { href: "/ratings", label: "Ratings", icon: "ratings" },         // no dock: true → only in the avatar menu on phones
];
```

```tsx
<span className="text-sm text-muted">Hello</span>
//    ^^^^^^^^^ the look, as short style words (Tailwind): text-sm = small text, text-muted = grey
```

Rules of thumb:

- **Text in quotes or between tags is safe to change.** For example, `"Trending anime"`, or the words in
  `<h2>Requests</h2>`.
- **Numbers with a name are settings in disguise.** For example, `const ROTATE_MS = 8000;` is the spotlight's time per
  slide in milliseconds.
- **`className="…"` is the styling.** Each word is a style. For example, `rounded-lg` gives rounded corners, `p-4`
  adds padding, `text-accent` makes text purple, and `sm:` / `lg:` mean "only on screens at least this wide".
  https://tailwindcss.com/docs lets you look any word up.
- **Lines starting with `//` or wrapped in `/* … */` are comments.** They're notes for humans, and I write them to
  explain *why* something is the way it is. They're worth reading.
- **Keep brackets, commas and quotes balanced.** Most breakages from a manual edit are a deleted `}` or `,`. The
  check below catches that.

---

## Common changes

| I want to… | Where | What to change |
|---|---|---|
| Change a colour (accent purple, background, …) | `src/app/globals.css`, the `@theme` block at the top | e.g. `--color-accent: #8b7cf6;` |
| Rename, reorder or hide a nav link | `src/components/Nav.tsx`, `LINKS` | Move or delete a line. `dock: true` puts it in the phone dock (keep that to ≤ 6). |
| Change spotlight speed | `src/components/Spotlight.tsx` | `ROTATE_MS = 8000` |
| Change when AniList gets updated while watching | `src/lib/playback.ts`, search `0.9` | 0.9 = at 90% of the episode |
| Change how often availability is checked | `src/lib/jobs/index.ts` | `"*/10 * * * *"` = every 10 minutes ([cron format](https://crontab.guru)) |
| Reorder sections on Discover | `src/app/page.tsx` | Move the `<…Section />` lines up or down |
| Change a label or message | Search for the text | Edit the words inside the quotes |

---

## Making a change safely

1. **Edit the file.** Any text editor works; VS Code is the friendliest because it underlines mistakes in red.
2. **Check it**, from the `jellyshelf` folder:
   ```sh
   npm run typecheck   # catches typos and broken code; silence = good
   npm test            # the 64 automatic tests; should say all passed
   ```
3. **Rebuild the container** so the running app picks it up (takes about a minute):
   ```sh
   docker compose -f docker-compose.example.yml up -d --build
   ```
   Then reload http://localhost:3000. If a page shows an error, `docker logs jellyshelf-jellyshelf-1 --tail 50` says
   why.
4. **Save it to history and GitHub** once you're happy:
   ```sh
   git add -A && git commit -m "Short description of the change" && git push
   ```

For quick experiments that skip the container rebuild, use `npm run dev` (once `npm install` has been run). It serves
the app at http://localhost:3000 and updates the browser as you save. Stop the container first (`docker compose -f
docker-compose.example.yml stop`) so the port is free, and start it again afterwards.

## Undoing things

- **A change you haven't committed yet:** `git restore src/path/to/file.tsx` puts that file back. `git restore .`
  puts back everything.
- **A committed change:** `git log --oneline` lists the changes, newest first, each with a short code like `75f5df6`.
  `git revert 75f5df6` undoes that one change (as a new commit, so nothing is lost). Rebuild the container afterwards.
- **Not sure what you changed?** `git diff` shows it: red is removed, green is added.

You can't break `config/` (your data) by editing code. The only way to lose data is deleting that folder.

---

## Things to leave alone

- `config/`: your database and the secret key that encrypts your saved Jellyfin, Sonarr, Radarr, Bazarr and AniList
  credentials. If `secret.key` is lost, everyone has to sign in again and you have to re-enter the service keys in
  Settings.
- `drizzle/`: database upgrade steps. They're generated from `src/db/schema.ts` and run automatically on start-up.
- `src/lib/mapping/`: the AniList → Sonarr season mapping. It's subtle, and covered by tests for a reason. If an anime
  lands on the wrong season, use the override on that anime's page (admin only) instead of changing code.
- `package-lock.json`: generated. It pins exact library versions.

## Glossary

- **Next.js**: the framework. It turns `src/app/` folders into pages and runs the server.
- **React**: how the pages are built, out of components (the `.tsx` building blocks).
- **Tailwind**: the short style words in `className`.
- **Drizzle / SQLite**: the database (one file, `config/jellyshelf.db`) and the code that reads it.
- **Server vs client code**: most code runs inside the container and sends finished HTML to your browser. Files
  starting with `"use client"` also run in the browser, for anything interactive: the player, menus, the spotlight.
- **TVDB / TMDB / AniList IDs**: each site numbers shows differently. Matching them up is most of what makes anime
  requests land on the right Sonarr season.
