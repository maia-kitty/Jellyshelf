import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { currentUser, isFirstUser } from "@/lib/auth";
import { radarr } from "@/lib/clients/radarr";
import { sonarr } from "@/lib/clients/sonarr";
import { jellyfin } from "@/lib/clients/jellyfin";
import { bazarr } from "@/lib/clients/bazarr";
import { tmdbClient } from "@/lib/clients/tmdb";
import { MASK, getSettings } from "@/lib/settings";

const body = z.object({
  service: z.enum(["tmdb", "sonarr", "radarr", "jellyfin", "bazarr"]),
  url: z.string().optional(),
  apiKey: z.string().optional(),
});

/** Check connectivity with the values currently in the form (falling back to saved ones). */
export function POST(req: Request) {
  return handle(async () => {
    const user = await currentUser();
    if (user?.role !== "admin" && !(!user && (await isFirstUser()))) throw new ApiError(403, "Admin only");
    const { service, url, apiKey } = body.parse(await req.json());
    const s = await getSettings();
    if (service === "tmdb") {
      await tmdbClient.ping();
      return { ok: true, message: "TMDB reachable" };
    }
    const saved = s[service];
    const cfg = { url: url || saved.url, apiKey: apiKey && apiKey !== MASK ? apiKey : saved.apiKey };
    if (service === "bazarr") {
      const st = await bazarr(cfg).status();
      return { ok: true, message: `Bazarr ${st.bazarr_version}` };
    }
    if (service === "jellyfin") {
      const info = await jellyfin(cfg).info();
      return { ok: true, message: `${info.ServerName} (Jellyfin ${info.Version})` };
    }
    const api = service === "sonarr" ? sonarr(cfg) : radarr(cfg);
    const [status, profiles, rootFolders, languageProfiles] = await Promise.all([
      api.status(),
      api.qualityProfiles(),
      api.rootFolders(),
      service === "sonarr" ? sonarr(cfg).languageProfiles() : Promise.resolve([]),
    ]);
    return {
      ok: true,
      message: `${service === "sonarr" ? "Sonarr" : "Radarr"} ${status.version}`,
      profiles: profiles.map((p) => ({ id: p.id, name: p.name })),
      rootFolders: rootFolders.map((r) => r.path),
      languageProfiles,
    };
  });
}
