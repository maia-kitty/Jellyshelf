import { expect, it, vi } from "vitest";
import { sonarr } from "./sonarr";

it("only asks Sonarr v3 for language profiles: v4 dropped them and warns on every call", async () => {
  const calls: string[] = [];
  let version = "4.0.20.0";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      return Response.json(url.endsWith("/system/status") ? { version } : [{ id: 1, name: "English" }]);
    }),
  );
  const api = sonarr({ url: "http://sonarr:8989", apiKey: "k" });
  expect(await api.languageProfiles()).toEqual([]);
  expect(calls).toEqual(["http://sonarr:8989/api/v3/system/status"]);
  version = "3.0.10.1567";
  expect(await api.languageProfiles()).toEqual([{ id: 1, name: "English" }]);
  expect(calls.at(-1)).toBe("http://sonarr:8989/api/v3/languageprofile");
});
