import { redirect } from "next/navigation";
import { requireUser } from "./auth";
import { getSettings } from "./settings";

/** Common guard for app pages: finish setup first, then require sign-in. */
export async function pageUser() {
  const s = await getSettings();
  if (!s.general.setupComplete) redirect("/setup");
  return requireUser();
}

export async function pageAdmin() {
  const user = await pageUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function param(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}
