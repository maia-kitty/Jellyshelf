import { describe, expect, it } from "vitest";
import { mangaDownload, videoDownload } from "./appDownloads";

describe("Android app downloads", () => {
  it("fetches a chapter's CBZ, keyed by manga and chapter", () => {
    const d = mangaDownload(105778, 12.5, "Chainsaw Man", null, "https://example.com/c.jpg");
    expect(d).toMatchObject({ key: "m:105778:12.5", kind: "manga", title: "Chapter 12.5", path: "/api/manga/105778/12.5/file", sort: 12.5, chapter: 12.5 });
  });
  it("fetches a video's original file through the Jellyfin relay, from its player link", () => {
    const d = videoDownload("/watch/0123456789abcdef0123456789abcdef", "Frieren", "S1E2 · Episode", 10002, 1e9);
    expect(d).toMatchObject({ key: "v:0123456789abcdef0123456789abcdef", itemId: "0123456789abcdef0123456789abcdef", path: "/api/jf/Videos/0123456789abcdef0123456789abcdef/stream?static=true", sort: 10002 });
  });
});
