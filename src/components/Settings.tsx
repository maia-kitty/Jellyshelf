"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import type { Settings } from "@/lib/settings";

type Redacted = Settings; // same shape, secrets masked

async function save(section: keyof Settings, values: Record<string, unknown>) {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ section, values }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? "Save failed");
  return j as Redacted;
}

function useSection<K extends keyof Settings>(section: K, initial: Settings[K]) {
  const [v, setV] = useState<Settings[K]>(initial);
  const [state, setState] = useState<{ busy: boolean; msg: string; ok: boolean }>({ busy: false, msg: "", ok: true });
  const set = <F extends keyof Settings[K]>(field: F, value: Settings[K][F]) => setV((p) => ({ ...p, [field]: value }));
  const submit = async () => {
    setState({ busy: true, msg: "", ok: true });
    try {
      const next = await save(section, v as Record<string, unknown>);
      setV(next[section]);
      setState({ busy: false, msg: "Saved", ok: true });
      return true;
    } catch (e) {
      setState({ busy: false, msg: (e as Error).message, ok: false });
      return false;
    }
  };
  return { v, set, submit, state };
}

export function Section({ title, desc, children }: { title: string; desc?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card mb-6 p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {desc && <div className="mt-1 text-sm text-muted">{desc}</div>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-accent" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function SaveBar({ state, onSave, extra }: { state: { busy: boolean; msg: string; ok: boolean }; onSave: () => void; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-2">
      <button className="btn-primary" disabled={state.busy} onClick={onSave}>
        {state.busy ? "Saving…" : "Save"}
      </button>
      {extra}
      {state.msg && <span className={clsx("text-sm", state.ok ? "text-ok" : "text-bad")}>{state.msg}</span>}
    </div>
  );
}

interface TestResult {
  ok: boolean;
  message?: string;
  error?: string;
  profiles?: { id: number; name: string }[];
  rootFolders?: string[];
  languageProfiles?: { id: number; name: string }[];
}

async function test(service: string, url?: string, apiKey?: string): Promise<TestResult> {
  const res = await fetch("/api/settings/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ service, url, apiKey }),
  });
  const j = await res.json().catch(() => ({}));
  return res.ok ? j : { ok: false, error: j.error ?? `HTTP ${res.status}` };
}

function TestButton({ onTest }: { onTest: () => Promise<TestResult> }) {
  const [r, setR] = useState<TestResult | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        className="btn-ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setR(await onTest());
          setBusy(false);
        }}
      >
        {busy ? "Testing…" : "Test"}
      </button>
      {r && <span className={clsx("text-sm", r.ok ? "text-ok" : "text-bad")}>{r.ok ? `✓ ${r.message}` : r.error}</span>}
    </>
  );
}

export function GeneralSettings({ initial }: { initial: Settings["general"] }) {
  const { v, set, submit, state } = useSection("general", initial);
  return (
    <Section title="General">
      <Field label="Public URL" hint="How you reach Kitsune in the browser. Used for the AniList OAuth redirect.">
        <input className="input" value={v.appUrl} onChange={(e) => set("appUrl", e.target.value)} placeholder="http://localhost:3000" />
      </Field>
      <Toggle label="Auto-approve requests from new users" checked={v.defaultAutoApprove} onChange={(x) => set("defaultAutoApprove", x)} />
      <SaveBar state={state} onSave={submit} />
    </Section>
  );
}

export function TmdbSettings({ initial }: { initial: Settings["tmdb"] }) {
  const { v, set, submit, state } = useSection("tmdb", initial);
  return (
    <Section
      title="TMDB"
      desc={
        <>
          Movie & series metadata. Get a free key at{" "}
          <a className="text-accent hover:underline" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">
            themoviedb.org/settings/api
          </a>{" "}
          (v3 key or v4 read token).
        </>
      }
    >
      <Field label="API key">
        <input className="input" value={v.apiKey} onChange={(e) => set("apiKey", e.target.value)} />
      </Field>
      <SaveBar state={state} onSave={submit} extra={<TestButton onTest={async () => ((await submit()) ? test("tmdb") : { ok: false, error: "Save failed" })} />} />
    </Section>
  );
}

export function AniListSettings({ initial, appUrl }: { initial: Settings["anilist"]; appUrl: string }) {
  const { v, set, submit, state } = useSection("anilist", initial);
  const redirect = `${appUrl.replace(/\/+$/, "")}/api/auth/anilist/callback`;
  return (
    <Section
      title="AniList"
      desc={
        <>
          Create an API client at{" "}
          <a className="text-anilist hover:underline" href="https://anilist.co/settings/developer" target="_blank" rel="noreferrer">
            anilist.co/settings/developer
          </a>{" "}
          with redirect URL <code className="rounded bg-panel-2 px-1.5 py-0.5 text-fg">{redirect}</code>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client ID">
          <input className="input" value={v.clientId} onChange={(e) => set("clientId", e.target.value)} />
        </Field>
        <Field label="Client secret">
          <input className="input" value={v.clientSecret} onChange={(e) => set("clientSecret", e.target.value)} />
        </Field>
      </div>
      <Toggle label="Add requested anime to the requester's AniList “Planning” list" checked={v.writeBack} onChange={(x) => set("writeBack", x)} />
      <SaveBar state={state} onSave={submit} />
    </Section>
  );
}

function ProfileSelect({
  value,
  options,
  onChange,
  placeholder = "Select…",
}: {
  value: number | null;
  options: { id: number; name: string }[];
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  return (
    <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
      {value !== null && !options.some((o) => o.id === value) && <option value={value}>#{value} (test to load names)</option>}
    </select>
  );
}

function FolderSelect({ value, options, onChange, placeholder = "Select…" }: { value: string; options: string[]; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {[...new Set([...options, ...(value ? [value] : [])])].map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function SonarrSettings({ initial }: { initial: Settings["sonarr"] }) {
  const { v, set, submit, state } = useSection("sonarr", initial);
  const [meta, setMeta] = useState<TestResult | null>(null);
  const runTest = async () => {
    const r = await test("sonarr", v.url, v.apiKey);
    if (r.ok) setMeta(r);
    return r;
  };
  return (
    <Section title="Sonarr" desc="Series and anime series. Anime is added with series type “Anime” (absolute numbering) into its own root folder.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="URL">
          <input className="input" value={v.url} onChange={(e) => set("url", e.target.value)} placeholder="http://sonarr:8989" />
        </Field>
        <Field label="API key">
          <input className="input" value={v.apiKey} onChange={(e) => set("apiKey", e.target.value)} />
        </Field>
        <Field label="Quality profile (series)">
          <ProfileSelect value={v.qualityProfileId} options={meta?.profiles ?? []} onChange={(x) => set("qualityProfileId", x)} />
        </Field>
        <Field label="Root folder (series)">
          <FolderSelect value={v.rootFolder} options={meta?.rootFolders ?? []} onChange={(x) => set("rootFolder", x)} />
        </Field>
        <Field label="Quality profile (anime)">
          <ProfileSelect value={v.animeQualityProfileId} options={meta?.profiles ?? []} onChange={(x) => set("animeQualityProfileId", x)} placeholder="Same as series" />
        </Field>
        <Field label="Root folder (anime)">
          <FolderSelect value={v.animeRootFolder} options={meta?.rootFolders ?? []} onChange={(x) => set("animeRootFolder", x)} placeholder="Same as series" />
        </Field>
        {!!meta?.languageProfiles?.length && (
          <Field label="Language profile (Sonarr v3)">
            <ProfileSelect value={v.languageProfileId} options={meta.languageProfiles} onChange={(x) => set("languageProfileId", x)} />
          </Field>
        )}
      </div>
      <Toggle label="Use season folders" checked={v.seasonFolder} onChange={(x) => set("seasonFolder", x)} />
      <SaveBar state={state} onSave={submit} extra={<TestButton onTest={runTest} />} />
    </Section>
  );
}

export function RadarrSettings({ initial }: { initial: Settings["radarr"] }) {
  const { v, set, submit, state } = useSection("radarr", initial);
  const [meta, setMeta] = useState<TestResult | null>(null);
  const runTest = async () => {
    const r = await test("radarr", v.url, v.apiKey);
    if (r.ok) setMeta(r);
    return r;
  };
  return (
    <Section title="Radarr" desc="Movies, including anime films.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="URL">
          <input className="input" value={v.url} onChange={(e) => set("url", e.target.value)} placeholder="http://radarr:7878" />
        </Field>
        <Field label="API key">
          <input className="input" value={v.apiKey} onChange={(e) => set("apiKey", e.target.value)} />
        </Field>
        <Field label="Quality profile">
          <ProfileSelect value={v.qualityProfileId} options={meta?.profiles ?? []} onChange={(x) => set("qualityProfileId", x)} />
        </Field>
        <Field label="Root folder">
          <FolderSelect value={v.rootFolder} options={meta?.rootFolders ?? []} onChange={(x) => set("rootFolder", x)} />
        </Field>
        <Field label="Quality profile (anime films)">
          <ProfileSelect value={v.animeQualityProfileId} options={meta?.profiles ?? []} onChange={(x) => set("animeQualityProfileId", x)} placeholder="Same as movies" />
        </Field>
        <Field label="Root folder (anime films)">
          <FolderSelect value={v.animeRootFolder} options={meta?.rootFolders ?? []} onChange={(x) => set("animeRootFolder", x)} placeholder="Same as movies" />
        </Field>
        <Field label="Minimum availability">
          <select className="input" value={v.minimumAvailability} onChange={(e) => set("minimumAvailability", e.target.value as typeof v.minimumAvailability)}>
            <option value="announced">Announced</option>
            <option value="inCinemas">In cinemas</option>
            <option value="released">Released</option>
          </select>
        </Field>
      </div>
      <SaveBar state={state} onSave={submit} extra={<TestButton onTest={runTest} />} />
    </Section>
  );
}

export function JellyfinSettings({ initial }: { initial: Settings["jellyfin"] }) {
  const { v, set, submit, state } = useSection("jellyfin", initial);
  return (
    <Section title="Jellyfin" desc="Used to show what's already in your library, and (optionally) to sign in with Jellyfin accounts.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="URL">
          <input className="input" value={v.url} onChange={(e) => set("url", e.target.value)} placeholder="http://jellyfin:8096" />
        </Field>
        <Field label="API key" hint="Dashboard → API Keys">
          <input className="input" value={v.apiKey} onChange={(e) => set("apiKey", e.target.value)} />
        </Field>
        <Field label="Public URL (optional)" hint="Address your browser uses for Jellyfin, for Play links. Leave empty if it's the same as the URL above.">
          <input className="input" value={v.publicUrl} onChange={(e) => set("publicUrl", e.target.value)} placeholder="https://jellyfin.example.com" />
        </Field>
      </div>
      <Toggle label="Allow signing in with Jellyfin accounts" checked={v.allowLogin} onChange={(x) => set("allowLogin", x)} />
      <SaveBar state={state} onSave={submit} extra={<TestButton onTest={() => test("jellyfin", v.url, v.apiKey)} />} />
    </Section>
  );
}

export function FinishSetup() {
  const router = useRouter();
  const [err, setErr] = useState("");
  return (
    <div className="flex items-center gap-3">
      <button
        className="btn-primary"
        onClick={async () => {
          try {
            await save("general", { setupComplete: true });
            router.push("/");
            router.refresh();
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        Finish setup →
      </button>
      {err && <span className="text-sm text-bad">{err}</span>}
    </div>
  );
}

export function JobButtons({ mappingCount }: { mappingCount: number }) {
  const [out, setOut] = useState<Record<string, string>>({});
  const run = async (name: string) => {
    setOut((o) => ({ ...o, [name]: "Running…" }));
    const res = await fetch(`/api/jobs/${name}`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setOut((o) => ({ ...o, [name]: res.ok ? JSON.stringify(j) : (j.error ?? "Failed") }));
  };
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-ghost" onClick={() => run("availability")}>
          Sync availability now
        </button>
        <span className="break-all text-muted">{out.availability ?? "Runs every 10 minutes and on webhooks."}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-ghost" onClick={() => run("mappings")}>
          Refresh anime ID mappings
        </button>
        <span className="text-muted">{out.mappings ?? `${mappingCount.toLocaleString()} AniList entries mapped. Refreshed daily.`}</span>
      </div>
    </div>
  );
}

export interface UserRow {
  id: number;
  displayName: string;
  avatar: string | null;
  role: "admin" | "user";
  anilist: boolean;
  jellyfin: boolean;
  autoApproveMovie: boolean;
  autoApproveTv: boolean;
  autoApproveAnime: boolean;
}

export function UsersTable({ users, selfId }: { users: UserRow[]; selfId: number }) {
  const router = useRouter();
  const patch = async (id: number, body: Partial<UserRow>) => {
    await fetch(`/api/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    router.refresh();
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted">
          <tr>
            <th className="py-2">User</th>
            <th>Login</th>
            <th>Admin</th>
            <th>Auto-approve movies</th>
            <th>Series</th>
            <th>Anime</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {users.map((u) => (
            <tr key={u.id}>
              <td className="py-2 font-medium">{u.displayName}</td>
              <td className="text-muted">{[u.anilist && "AniList", u.jellyfin && "Jellyfin"].filter(Boolean).join(", ")}</td>
              <td>
                <input type="checkbox" className="accent-accent" disabled={u.id === selfId} checked={u.role === "admin"} onChange={(e) => patch(u.id, { role: e.target.checked ? "admin" : "user" })} />
              </td>
              {(["autoApproveMovie", "autoApproveTv", "autoApproveAnime"] as const).map((k) => (
                <td key={k}>
                  <input type="checkbox" className="accent-accent" checked={u[k]} onChange={(e) => patch(u.id, { [k]: e.target.checked })} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
