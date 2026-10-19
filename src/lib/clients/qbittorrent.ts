import { HttpError, joinUrl } from "./http";

export interface QbitConfig {
  url: string;
  username: string;
  password: string;
}

/** qBittorrent's Web API (v2): sign in for a session cookie, then call with it. */
export function qbittorrent(cfg: QbitConfig) {
  if (!cfg.url) throw new Error("qBittorrent is not configured");
  let cookie: string | null = null;
  const login = async () => {
    const res = await fetch(joinUrl(cfg.url, "/api/v2/auth/login"), {
      method: "POST",
      body: new URLSearchParams({ username: cfg.username, password: cfg.password }),
      signal: AbortSignal.timeout(10_000),
    });
    // A wrong password is still HTTP 200, with "Fails." for a body.
    if (!res.ok || (await res.text()).trim() !== "Ok.") throw new Error("qBittorrent didn't accept the username and password");
    cookie = res.headers.getSetCookie().find((c) => c.startsWith("SID="))?.split(";")[0] ?? null;
    // No cookie: auth is switched off for this address (qBittorrent's "bypass for clients on localhost/subnet").
  };
  const call = async (path: string, form?: Record<string, string>) => {
    if (cookie === null) await login();
    const res = await fetch(joinUrl(cfg.url, `/api/v2${path}`), {
      method: form ? "POST" : "GET",
      headers: cookie ? { Cookie: cookie } : {},
      body: form && new URLSearchParams(form),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new HttpError(res.status, path, await res.text().catch(() => ""));
    return res.text();
  };
  return {
    version: () => call("/app/version"),
    /** Remove torrents, and with `deleteFiles` what they downloaded. Hashes qBittorrent doesn't have are ignored. */
    remove: (hashes: string[], deleteFiles: boolean) =>
      hashes.length ? call("/torrents/delete", { hashes: hashes.map((h) => h.toLowerCase()).join("|"), deleteFiles: String(deleteFiles) }) : Promise.resolve(""),
  };
}
