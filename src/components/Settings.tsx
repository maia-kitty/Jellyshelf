"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import type { Settings } from "@/lib/settings";
import { unreachable } from "@/lib/unreachable";
import { Select } from "./Select";
import { Switch } from "./Switch";
import { initial } from "@/lib/initial";
import { NTFY_SH } from "@/lib/ntfyShared";

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

/** A section's form: the values being edited, whether they differ from what's saved, and saving or discarding them. */
function useSection<K extends keyof Settings>(section: K, initial: Settings[K]) {
  const router = useRouter();
  const [saved, setSaved] = useState<Settings[K]>(initial);
  const [v, setV] = useState<Settings[K]>(initial);
  const [state, setState] = useState<{ busy: boolean; msg: string; ok: boolean }>({ busy: false, msg: "", ok: true });
  const set = <F extends keyof Settings[K]>(field: F, value: Settings[K][F]) => setV((p) => ({ ...p, [field]: value }));
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const submit = async () => {
    setState({ busy: true, msg: "", ok: true });
    try {
      const next = await save(section, v as Record<string, unknown>);
      setV(next[section]);
      setSaved(next[section]);
      setState({ busy: false, msg: "Saved", ok: true });
      setTimeout(() => setState((s) => (s.msg === "Saved" ? { ...s, msg: "" } : s)), 2500);
      router.refresh(); // e.g. setup offers Jellyfin sign-in once Jellyfin is saved
      return true;
    } catch (e) {
      setState({ busy: false, msg: (e as Error).message, ok: false });
      return false;
    }
  };
  const discard = () => {
    setV(saved);
    setState({ busy: false, msg: "", ok: true });
  };
  return { v, set, submit, discard, dirty, state };
}

interface TestResult {
  ok: boolean;
  message?: string;
  error?: string;
  profiles?: { id: number; name: string }[];
  rootFolders?: string[];
  languageProfiles?: { id: number; name: string }[];
}

async function test(service: string, url?: string, apiKey?: string, username?: string): Promise<TestResult> {
  const res = await fetch("/api/settings/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ service, url, apiKey, username }),
  });
  const j = await res.json().catch(() => ({}));
  return res.ok ? j : { ok: false, error: j.error ?? `HTTP ${res.status}` };
}

type Check = { busy: boolean; result: TestResult | null; run: () => void };

/** A connection check. With `auto`, it runs once as the page opens (with what's saved), so the status is there to see. */
function useCheck(fn: () => Promise<TestResult>, auto = false): Check {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const run = async () => {
    setBusy(true);
    setResult(await fn());
    setBusy(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void (auto && run()), []);
  return { busy, result, run };
}

function Status({ check, configured }: { check?: Check; configured?: boolean }) {
  const r = check?.result;
  const [dot, text, tone] = check?.busy
    ? ["bg-muted animate-pulse", "Checking…", "text-muted"]
    : r?.ok
      ? ["bg-ok", "Connected", "text-ok"]
      : r
        ? ["bg-bad", "Can't connect", "text-bad"]
        : configured === false
          ? ["bg-line", "Not set up", "text-muted"]
          : [null, null, null];
  if (!text) return null;
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full bg-panel-2 px-2.5 py-0.5 text-xs", tone)}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", dot)} />
      {text}
    </span>
  );
}

/**
 * One block of settings: its name and connection status, a one-line description, the longer story folded away under
 * "How it works", and its fields.
 */
export function Section({
  title,
  desc,
  more,
  check,
  configured,
  children,
}: {
  title: string;
  desc?: React.ReactNode;
  more?: React.ReactNode;
  check?: Check;
  configured?: boolean;
  children: React.ReactNode;
}) {
  const r = check?.result;
  return (
    <section className="card mb-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-lg font-semibold">{title}</h2>
            <Status check={check} configured={configured} />
            {r?.ok && r.message && <span className="text-xs text-muted">{r.message}</span>}
          </div>
          {desc && <div className="mt-1 text-sm text-muted">{desc}</div>}
        </div>
        {check && (
          <button className="btn-ghost px-3 py-1.5" disabled={check.busy} onClick={check.run}>
            {check.busy ? "Testing…" : "Test connection"}
          </button>
        )}
      </div>
      {r && !r.ok && <p className="mt-3 rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{r.error}</p>}
      {more && (
        <details className="mt-2 text-sm text-muted">
          <summary className="w-fit cursor-pointer select-none text-accent hover:underline">How it works</summary>
          <div className="mt-2 space-y-2 leading-relaxed">{more}</div>
        </details>
      )}
      <div className="mt-5 space-y-5">{children}</div>
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

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 text-sm">
      <span>
        {label}
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <Switch on={checked} className="mt-0.5 ring-accent/60 ring-offset-2 ring-offset-panel peer-focus-visible:ring-2" />
    </label>
  );
}

/** Appears once something's changed, and stays in view at the bottom of the window until it's saved or discarded. */
function SaveBar({ form }: { form: Pick<ReturnType<typeof useSection>, "dirty" | "state" | "submit" | "discard"> }) {
  const { dirty, state, submit, discard } = form;
  if (!dirty && !state.msg) return null;
  return (
    <div className="menu-in sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel-2/95 px-4 py-2.5 shadow-xl shadow-black/40 backdrop-blur">
      <span className={clsx("flex-1 text-sm", !state.ok ? "text-bad" : dirty ? "text-fg" : "text-ok")}>
        {!state.ok ? state.msg : dirty ? "Unsaved changes" : `✓ ${state.msg}`}
      </span>
      {dirty && (
        <>
          <button className="btn-ghost px-3 py-1.5" disabled={state.busy} onClick={discard}>
            Discard
          </button>
          <button className="btn-primary px-3 py-1.5" disabled={state.busy} onClick={submit}>
            {state.busy ? "Saving…" : "Save"}
          </button>
        </>
      )}
    </div>
  );
}

const link = (href: string, text: string, className = "text-accent") => (
  <a className={clsx(className, "hover:underline")} href={href} target="_blank" rel="noreferrer">
    {text}
  </a>
);

export function GeneralSettings({ initial }: { initial: Settings["general"] }) {
  const form = useSection("general", initial);
  const { v, set } = form;
  return (
    <Section title="General" desc="Where Jellyshelf lives, and what new people can do.">
      <Field label="Public URL" hint="How you reach Jellyshelf in the browser. AniList sign-in sends people back here.">
        <input className="input" value={v.appUrl} onChange={(e) => set("appUrl", e.target.value)} placeholder="http://localhost:3000" />
      </Field>
      <Toggle
        label="Auto-approve requests from new users"
        hint="Their requests go straight to Sonarr/Radarr. You can change it per person under Users."
        checked={v.defaultAutoApprove}
        onChange={(x) => set("defaultAutoApprove", x)}
      />
      <SaveBar form={form} />
    </Section>
  );
}

export function TmdbSettings({ initial }: { initial: Settings["tmdb"] }) {
  const form = useSection("tmdb", initial);
  const { v, set, submit } = form;
  // TMDB is checked with the saved key, so a test saves first.
  const check = useCheck(async () => ((await submit()) ? test("tmdb") : { ok: false, error: "Save failed" }), !!initial.apiKey);
  return (
    <Section
      title="TMDB"
      check={check}
      configured={!!initial.apiKey}
      desc={<>Movie and series details and artwork. Get a free key at {link("https://www.themoviedb.org/settings/api", "themoviedb.org")} (v3 key or v4 read token).</>}
    >
      <Field label="API key">
        <input className="input" value={v.apiKey} onChange={(e) => set("apiKey", e.target.value)} autoComplete="off" />
      </Field>
      <SaveBar form={form} />
    </Section>
  );
}

export function AniListSettings({ initial, appUrl }: { initial: Settings["anilist"]; appUrl: string }) {
  const form = useSection("anilist", initial);
  const { v, set } = form;
  const redirect = `${appUrl.replace(/\/+$/, "")}/api/auth/anilist/callback`;
  return (
    <Section
      title="AniList"
      configured={!!initial.clientId}
      desc="Lets people sign in with AniList, see their lists and keep their progress in sync."
      more={
        <p>
          Create an API client at {link("https://anilist.co/settings/developer", "anilist.co/settings/developer", "text-anilist")} with the redirect URL{" "}
          <code className="break-all rounded bg-panel-2 px-1.5 py-0.5 text-fg">{redirect}</code>, then paste its ID and secret here.
        </p>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client ID">
          <input className="input" value={v.clientId} onChange={(e) => set("clientId", e.target.value)} />
        </Field>
        <Field label="Client secret">
          <input className="input" value={v.clientSecret} onChange={(e) => set("clientSecret", e.target.value)} autoComplete="off" />
        </Field>
      </div>
      <Toggle label="Add requested anime to the requester's “Planning” list" checked={v.writeBack} onChange={(x) => set("writeBack", x)} />
      <SaveBar form={form} />
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

/** A small heading inside a section, to group its fields. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-fg/90">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Connection<K extends "sonarr" | "radarr" | "jellyfin" | "bazarr" | "mangarr">({
  v,
  set,
  placeholder,
  keyHint,
}: {
  v: Settings[K];
  set: (field: "url" | "apiKey", value: string) => void;
  placeholder: string;
  keyHint?: string;
}) {
  return (
    <Group title="Connection">
      <Field label="URL">
        <input className="input" value={v.url} onChange={(e) => set("url", e.target.value)} placeholder={placeholder} />
      </Field>
      <Field label="API key" hint={keyHint}>
        <input className="input" value={v.apiKey} onChange={(e) => set("apiKey", e.target.value)} autoComplete="off" />
      </Field>
    </Group>
  );
}

export function SonarrSettings({ initial }: { initial: Settings["sonarr"] }) {
  const form = useSection("sonarr", initial);
  const { v, set } = form;
  const [meta, setMeta] = useState<TestResult | null>(null);
  const configured = !!(initial.url && initial.apiKey);
  const check = useCheck(async () => {
    const r = await test("sonarr", v.url, v.apiKey);
    if (r.ok) setMeta(r);
    return r;
  }, configured);
  return (
    <Section
      title="Sonarr"
      check={check}
      configured={configured}
      desc="Downloads series and anime."
      more={<p>Anime is added with the series type “Anime” (absolute episode numbering), into its own root folder and quality profile if you pick them below.</p>}
    >
      <Connection v={v} set={set} placeholder="http://sonarr:8989" keyHint="Settings → General → Security" />
      <Group title="Series">
        <Field label="Quality profile">
          <ProfileSelect value={v.qualityProfileId} options={meta?.profiles ?? []} onChange={(x) => set("qualityProfileId", x)} />
        </Field>
        <Field label="Root folder">
          <FolderSelect value={v.rootFolder} options={meta?.rootFolders ?? []} onChange={(x) => set("rootFolder", x)} />
        </Field>
      </Group>
      <Group title="Anime">
        <Field label="Quality profile">
          <ProfileSelect value={v.animeQualityProfileId} options={meta?.profiles ?? []} onChange={(x) => set("animeQualityProfileId", x)} placeholder="Same as series" />
        </Field>
        <Field label="Dub quality profile" hint="Used when anime is requested dubbed. Without one, requests don't offer Sub/Dub.">
          <ProfileSelect value={v.animeDubQualityProfileId} options={meta?.profiles ?? []} onChange={(x) => set("animeDubQualityProfileId", x)} placeholder="None" />
        </Field>
        <Field label="Root folder">
          <FolderSelect value={v.animeRootFolder} options={meta?.rootFolders ?? []} onChange={(x) => set("animeRootFolder", x)} placeholder="Same as series" />
        </Field>
      </Group>
      {!!meta?.languageProfiles?.length && (
        <Field label="Language profile (Sonarr v3)">
          <ProfileSelect value={v.languageProfileId} options={meta.languageProfiles} onChange={(x) => set("languageProfileId", x)} />
        </Field>
      )}
      <Toggle label="Use season folders" checked={v.seasonFolder} onChange={(x) => set("seasonFolder", x)} />
      <SaveBar form={form} />
    </Section>
  );
}

export function RadarrSettings({ initial }: { initial: Settings["radarr"] }) {
  const form = useSection("radarr", initial);
  const { v, set } = form;
  const [meta, setMeta] = useState<TestResult | null>(null);
  const configured = !!(initial.url && initial.apiKey);
  const check = useCheck(async () => {
    const r = await test("radarr", v.url, v.apiKey);
    if (r.ok) setMeta(r);
    return r;
  }, configured);
  return (
    <Section title="Radarr" check={check} configured={configured} desc="Downloads movies, including anime films.">
      <Connection v={v} set={set} placeholder="http://radarr:7878" keyHint="Settings → General → Security" />
      <Group title="Movies">
        <Field label="Quality profile">
          <ProfileSelect value={v.qualityProfileId} options={meta?.profiles ?? []} onChange={(x) => set("qualityProfileId", x)} />
        </Field>
        <Field label="Root folder">
          <FolderSelect value={v.rootFolder} options={meta?.rootFolders ?? []} onChange={(x) => set("rootFolder", x)} />
        </Field>
      </Group>
      <Group title="Anime films">
        <Field label="Quality profile">
          <ProfileSelect value={v.animeQualityProfileId} options={meta?.profiles ?? []} onChange={(x) => set("animeQualityProfileId", x)} placeholder="Same as movies" />
        </Field>
        <Field label="Dub quality profile" hint="Used when an anime film is requested dubbed. Without one, requests don't offer Sub/Dub.">
          <ProfileSelect value={v.animeDubQualityProfileId} options={meta?.profiles ?? []} onChange={(x) => set("animeDubQualityProfileId", x)} placeholder="None" />
        </Field>
        <Field label="Root folder">
          <FolderSelect value={v.animeRootFolder} options={meta?.rootFolders ?? []} onChange={(x) => set("animeRootFolder", x)} placeholder="Same as movies" />
        </Field>
      </Group>
      <Field label="Minimum availability" hint="When Radarr starts looking for a requested movie.">
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
      <SaveBar form={form} />
    </Section>
  );
}

export function JellyfinSettings({ initial }: { initial: Settings["jellyfin"] }) {
  const form = useSection("jellyfin", initial);
  const { v, set } = form;
  const configured = !!(initial.url && initial.apiKey);
  const check = useCheck(() => test("jellyfin", v.url, v.apiKey), configured);
  return (
    <Section title="Jellyfin" check={check} configured={configured} desc="Your library, playback, and the accounts people sign in with.">
      <Connection v={v} set={set} placeholder="http://jellyfin:8096" keyHint="Dashboard → API Keys" />
      <Field label="Public URL (optional)" hint="The address your browser uses for Jellyfin, for “Open in Jellyfin” links. Leave empty if it's the same as above.">
        <input className="input" value={v.publicUrl} onChange={(e) => set("publicUrl", e.target.value)} placeholder="https://jellyfin.example.com" />
      </Field>
      <SaveBar form={form} />
    </Section>
  );
}

export function BazarrSettings({ initial }: { initial: Settings["bazarr"] }) {
  const form = useSection("bazarr", initial);
  const { v, set } = form;
  const configured = !!(initial.url && initial.apiKey);
  const check = useCheck(() => test("bazarr", v.url, v.apiKey), configured);
  return (
    <Section title="Bazarr" check={check} configured={configured} desc="Optional. Shows which subtitles each episode and film has, and lets people fix missing ones.">
      <Connection v={v} set={set} placeholder="http://bazarr:6767" keyHint="Settings → General → Security" />
      <Field label="Who can search for and pick subtitles">
        <Select
          value={v.fixSubsBy}
          onChange={(x) => set("fixSubsBy", x)}
          options={[
            { value: "requesters", label: "Admins, and whoever requested the title" },
            { value: "admin", label: "Admins only" },
          ]}
        />
      </Field>
      <SaveBar form={form} />
    </Section>
  );
}

export function MangarrSettings({ initial }: { initial: Settings["mangarr"] }) {
  const form = useSection("mangarr", initial);
  const { v, set } = form;
  const configured = !!initial.url;
  const check = useCheck(() => test("mangarr", v.url, v.apiKey), configured);
  return (
    <Section
      title="Mangarr"
      check={check}
      configured={configured}
      desc="Optional. Downloads manga (Sonarr for manga), so manga can be requested and read here."
      more={<p>Mangarr picks the source and keeps checking for new chapters. Jellyshelf only sends it requests and reads the pages it serves. The API key isn&apos;t needed when Jellyshelf reaches Mangarr on a local address.</p>}
    >
      <Connection v={v} set={set} placeholder="http://mangarr:8206" keyHint="Mangarr → Settings → General. Optional on a local address" />
      <SaveBar form={form} />
    </Section>
  );
}

export function QbittorrentSettings({ initial }: { initial: Settings["qbittorrent"] }) {
  const form = useSection("qbittorrent", initial);
  const { v, set } = form;
  const configured = !!initial.url;
  const check = useCheck(() => test("qbittorrent", v.url, v.password, v.username), configured);
  return (
    <Section
      title="qBittorrent"
      check={check}
      configured={configured}
      desc="Optional. Cleans up a title's torrents when it's removed through Jellyshelf."
      more={
        <p>
          When a title is removed from Sonarr or Radarr through Jellyshelf, its torrents are removed from qBittorrent too, with what they downloaded.
          Without this they'd be left seeding, and the space they share with your library (hardlinks) wouldn&apos;t come back.
        </p>
      }
    >
      <Field label="URL" hint="The Web UI's address">
        <input className="input" value={v.url} onChange={(e) => set("url", e.target.value)} placeholder="http://qbittorrent:8080" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Username">
          <input className="input" value={v.username} onChange={(e) => set("username", e.target.value)} placeholder="admin" autoComplete="off" />
        </Field>
        <Field label="Password">
          <input className="input" type="password" value={v.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
        </Field>
      </div>
      <SaveBar form={form} />
    </Section>
  );
}

export function NtfySettings({ initial }: { initial: Settings["ntfy"] }) {
  const form = useSection("ntfy", initial);
  const { v, set } = form;
  // Not run on open: testing sends you a real notification.
  const check = useCheck(() => test("ntfy", v.url, v.token));
  return (
    <Section
      title="Phone notifications"
      check={check}
      configured={!!initial.url}
      desc="Optional. Notifications through ntfy when requests are approved, declined or ready to watch."
      more={
        <>
          <p>Admins are also told when someone requests something. Testing sends a notification to your own topic.</p>
          <p>
            People subscribe in the ntfy app (account menu → Phone notifications): at ntfy itself if it&apos;s reachable from anywhere, like the free public
            ntfy.sh, otherwise through Jellyshelf&apos;s own address, which only works where Jellyshelf can be reached.
          </p>
        </>
      }
    >
      <button
        className="btn-ghost px-3 py-1.5"
        onClick={() => {
          set("url", NTFY_SH);
          set("token", "");
          set("direct", true);
        }}
      >
        Use ntfy.sh (free, works anywhere)
      </button>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="URL" hint="Where Jellyshelf reaches your ntfy server">
          <input className="input" value={v.url} onChange={(e) => set("url", e.target.value)} placeholder="http://ntfy:80" />
        </Field>
        <Field label="Access token (optional)" hint="Only if your ntfy doesn't let just anyone publish and read. Needs read and write access to topics starting with js_">
          <input className="input" value={v.token} onChange={(e) => set("token", e.target.value)} placeholder="tk_…" autoComplete="off" />
        </Field>
      </div>
      <Toggle
        label="Phones subscribe at this ntfy directly"
        hint="Turn on if it's reachable from the internet, like ntfy.sh."
        checked={v.direct}
        onChange={(x) => set("direct", x)}
      />
      {v.direct && v.token && (
        <p className="text-xs text-warn">Phones subscribing directly don&apos;t get the access token, so they can only read topics this ntfy lets anyone read.</p>
      )}
      <SaveBar form={form} />
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

/** "updatedMedia: 1" → "updated media 1" */
const words = (k: string) => k.replace(/([A-Z])/g, " $1").toLowerCase();

const JOBS = [
  { name: "availability", title: "Sync availability", note: () => "Checks Sonarr, Radarr and Jellyfin for what's arrived. Runs every 10 minutes, and on webhooks." },
  { name: "mappings", title: "Refresh anime ID mappings", note: (n: number) => `Links AniList entries to TVDB/TMDB. ${n.toLocaleString()} mapped; refreshed daily.` },
  { name: "backup", title: "Back up the database", note: () => "Backed up nightly to config/backups, keeping the last 7 days." },
];

export function JobButtons({ mappingCount }: { mappingCount: number }) {
  const [out, setOut] = useState<Record<string, { busy?: boolean; ok?: boolean; text?: string }>>({});
  const run = async (name: string) => {
    setOut((o) => ({ ...o, [name]: { busy: true } }));
    const res = await fetch(`/api/jobs/${name}`, { method: "POST" }).catch(unreachable);
    const j = await res.json().catch(() => ({}));
    const text = res.ok
      ? Object.entries(j)
          .map(([k, v]) => `${words(k)} ${typeof v === "object" ? JSON.stringify(v) : v}`)
          .join(" · ")
      : (j.error ?? "Failed");
    setOut((o) => ({ ...o, [name]: { ok: res.ok, text } }));
  };
  return (
    <div className="divide-y divide-line">
      {JOBS.map((job) => {
        const o = out[job.name];
        return (
          <div key={job.name} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-medium">{job.title}</div>
              <div className={clsx("break-words text-xs", o?.text ? (o.ok ? "text-ok" : "text-bad") : "text-muted")}>
                {o?.text ? `${o.ok ? "✓ Done: " : ""}${o.text}` : job.note(mappingCount)}
              </div>
            </div>
            <button className="btn-ghost px-3 py-1.5" disabled={o?.busy} onClick={() => run(job.name)}>
              {o?.busy ? "Running…" : "Run now"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** A value to paste somewhere else, with a copy button. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-panel-2 px-3 py-2 text-xs">{value}</code>
        <button
          className="btn-ghost shrink-0 px-3"
          onClick={async () => {
            await navigator.clipboard?.writeText(value).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
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
  autoApproveManga: boolean;
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
    ["autoApproveManga", "Manga"],
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
