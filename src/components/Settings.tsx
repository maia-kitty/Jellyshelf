"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import type { Settings } from "@/lib/settings";
import { unreachable } from "@/lib/unreachable";
import { Select } from "./Select";
import { initial } from "@/lib/initial";

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
  const router = useRouter();
  const [v, setV] = useState<Settings[K]>(initial);
  const [state, setState] = useState<{ busy: boolean; msg: string; ok: boolean }>({ busy: false, msg: "", ok: true });
  const set = <F extends keyof Settings[K]>(field: F, value: Settings[K][F]) => setV((p) => ({ ...p, [field]: value }));
  const submit = async () => {
    setState({ busy: true, msg: "", ok: true });
    try {
      const next = await save(section, v as Record<string, unknown>);
      setV(next[section]);
      setState({ busy: false, msg: "Saved", ok: true });
      router.refresh(); // e.g. setup offers Jellyfin sign-in once Jellyfin is saved
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
      <Field label="Public URL" hint="How you reach Jellyshelf in the browser. Used for the AniList OAuth redirect.">
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
    <Select<number | "">
      value={value ?? ""}
      onChange={(v) => onChange(v === "" ? null : v)}
      options={[
        { value: "", label: placeholder },
        ...options.map((o) => ({ value: o.id, label: o.name })),
        ...(value !== null && !options.some((o) => o.id === value) ? [{ value, label: `#${value} (test to load names)` }] : []),
      ]}
    />
  );
}

function FolderSelect({ value, options, onChange, placeholder = "Select…" }: { value: string; options: string[]; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Select
      value={value}
      onChange={onChange}
      options={[{ value: "", label: placeholder }, ...[...new Set([...options, ...(value ? [value] : [])])].map((o) => ({ value: o, label: o }))]}
    />
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
          <Select
            value={v.minimumAvailability}
            onChange={(x) => set("minimumAvailability", x)}
            options={[
              { value: "announced", label: "Announced" },
              { value: "inCinemas", label: "In cinemas" },
              { value: "released", label: "Released" },
            ]}
          />
        </Field>
      </div>
      <SaveBar state={state} onSave={submit} extra={<TestButton onTest={runTest} />} />
    </Section>
  );
}

export function JellyfinSettings({ initial }: { initial: Settings["jellyfin"] }) {
  const { v, set, submit, state } = useSection("jellyfin", initial);
  return (
    <Section title="Jellyfin" desc="Your library, playback, and the accounts people sign in with.">
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
      <SaveBar state={state} onSave={submit} extra={<TestButton onTest={() => test("jellyfin", v.url, v.apiKey)} />} />
    </Section>
  );
}

export function BazarrSettings({ initial }: { initial: Settings["bazarr"] }) {
  const { v, set, submit, state } = useSection("bazarr", initial);
  return (
    <Section title="Bazarr" desc="Optional. Shows which subtitles each episode and film has, and lets people search for missing ones or pick a specific file.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="URL">
          <input className="input" value={v.url} onChange={(e) => set("url", e.target.value)} placeholder="http://bazarr:6767" />
        </Field>
        <Field label="API key" hint="Settings → General → Security">
          <input className="input" value={v.apiKey} onChange={(e) => set("apiKey", e.target.value)} />
        </Field>
        <Field label="Who can search and pick subtitles">
          <Select
            value={v.fixSubsBy}
            onChange={(x) => set("fixSubsBy", x)}
            options={[
              { value: "requesters", label: "Admins, and whoever requested the title" },
              { value: "admin", label: "Admins only" },
            ]}
          />
        </Field>
      </div>
      <SaveBar state={state} onSave={submit} extra={<TestButton onTest={() => test("bazarr", v.url, v.apiKey)} />} />
    </Section>
  );
}

export function NtfySettings({ initial }: { initial: Settings["ntfy"] }) {
  const { v, set, submit, state } = useSection("ntfy", initial);
  return (
    <Section
      title="Notifications (ntfy)"
      desc="Optional. Phone notifications when a request is approved, declined or ready to watch, and for admins when someone requests something. People subscribe in the ntfy app using Jellyshelf's own address (account menu → Phone notifications), so ntfy doesn't need to be reachable from outside."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="URL" hint="Where Jellyshelf reaches your ntfy server">
          <input className="input" value={v.url} onChange={(e) => set("url", e.target.value)} placeholder="http://ntfy:80" />
        </Field>
        <Field label="Access token (optional)" hint="Only if your ntfy server doesn't let just anyone publish and read. Needs read and write access to topics starting with js_">
          <input className="input" value={v.token} onChange={(e) => set("token", e.target.value)} placeholder="tk_…" />
        </Field>
      </div>
      <SaveBar state={state} onSave={submit} extra={<TestButton onTest={() => test("ntfy", v.url, v.token)} />} />
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
    const res = await fetch(`/api/jobs/${name}`, { method: "POST" }).catch(unreachable);
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

/** A pill toggle: ✓ and accent when on. */
function Chip({ on, children, ...props }: { on: boolean; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      aria-pressed={on}
      className={clsx(
        "rounded-full border px-3 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-60",
        on ? "border-accent bg-accent/15 text-fg" : "border-line text-muted enabled:hover:text-fg",
      )}
    >
      {on ? "✓ " : ""}
      {children}
    </button>
  );
}

export function UsersTable({ users, selfId }: { users: UserRow[]; selfId: number }) {
  const router = useRouter();
  const patch = async (id: number, body: Partial<UserRow>) => {
    await fetch(`/api/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    router.refresh();
  };
  const kinds = [
    ["autoApproveMovie", "Movies"],
    ["autoApproveTv", "Series"],
    ["autoApproveAnime", "Anime"],
  ] as const;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-muted">
          <tr className="[&>th]:px-3 [&>th]:pb-2 [&>th]:font-medium">
            <th>User</th>
            <th>Signs in with</th>
            <th className="text-center">Role</th>
            <th>Auto-approve</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {users.map((u) => (
            <tr key={u.id} className="[&>td]:px-3 [&>td]:py-3 [&>td]:align-middle">
              <td>
                <div className="flex items-center gap-3">
                  {u.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-panel-2 text-sm">{initial(u.displayName)}</div>
                  )}
                  <span className="font-medium">{u.displayName}</span>
                  {u.id === selfId && <span className="text-xs text-muted">(you)</span>}
                </div>
              </td>
              <td>
                <div className="flex gap-1.5">
                  {u.jellyfin && <span className="rounded-md bg-[#00a4dc]/15 px-2 py-0.5 text-xs text-[#4cc3ee]">Jellyfin</span>}
                  {u.anilist && <span className="rounded-md bg-anilist/15 px-2 py-0.5 text-xs text-anilist">AniList</span>}
                </div>
              </td>
              <td className="text-center">
                <Chip
                  on={u.role === "admin"}
                  disabled={u.id === selfId}
                  title={u.id === selfId ? "You can't remove your own admin role" : undefined}
                  onClick={() => patch(u.id, { role: u.role === "admin" ? "user" : "admin" })}
                >
                  Admin
                </Chip>
              </td>
              <td>
                <div className="flex flex-wrap gap-1.5">
                  {kinds.map(([k, label]) => (
                    <Chip key={k} on={u[k]} onClick={() => patch(u.id, { [k]: !u[k] })}>
                      {label}
                    </Chip>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
