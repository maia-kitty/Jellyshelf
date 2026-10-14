import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/db";
import type { User } from "@/db/schema";
import { appSecret, decrypt, encrypt } from "./secret";
import { getSettings } from "./settings";

export interface SessionData {
  userId?: number;
  /** CSRF state for the AniList OAuth round trip. */
  oauthState?: string;
}

function sessionOptions(appUrl: string): SessionOptions {
  return {
    cookieName: "kitsune_session",
    password: appSecret(),
    cookieOptions: {
      // Self-hosted over plain http on a LAN is common; only demand https when that's how we're served.
      secure: appUrl.startsWith("https://"),
      sameSite: "lax",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
    },
  };
}

export async function getSession() {
  const { general } = await getSettings();
  return getIronSession<SessionData>(await cookies(), sessionOptions(general.appUrl));
}

export async function currentUser(): Promise<User | null> {
  const session = await getSession();
  if (!session.userId) return null;
  await ensureMigrated();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.userId));
  return user ?? null;
}

/** For server components/pages: redirect to /login when signed out. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export class AuthError extends Error {
  constructor(
    public status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

/** For route handlers: throws AuthError (see `handle` in lib/api.ts). */
export async function apiUser(opts: { admin?: boolean } = {}): Promise<User> {
  const user = await currentUser();
  if (!user) throw new AuthError(401, "Not signed in");
  if (opts.admin && user.role !== "admin") throw new AuthError(403, "Admin only");
  return user;
}

export function anilistToken(user: User): string | null {
  if (!user.anilistToken) return null;
  if (user.anilistTokenExpires && user.anilistTokenExpires.getTime() < Date.now()) return null;
  try {
    return decrypt(user.anilistToken);
  } catch {
    return null;
  }
}

export { encrypt };

/** First account ever created becomes admin. */
export async function isFirstUser() {
  await ensureMigrated();
  return (await db.$count(schema.users)) === 0;
}
