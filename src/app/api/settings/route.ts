import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { currentUser, isFirstUser } from "@/lib/auth";
import { MASK, getSettings, redactSettings, settingsSchema, updateSettings, type SettingsSection } from "@/lib/settings";

/**
 * Settings are admin-only, except during first-run setup: before any account exists,
 * the wizard needs to save TMDB/AniList credentials so the first person can sign in.
 */
async function authorize() {
  const user = await currentUser();
  if (user?.role === "admin") return;
  if (!user && (await isFirstUser())) return;
  throw new ApiError(user ? 403 : 401, "Admin only");
}

export function GET() {
  return handle(async () => {
    await authorize();
    return redactSettings(await getSettings());
  });
}

const body = z.object({
  section: z.enum(Object.keys(settingsSchema.shape) as [SettingsSection, ...SettingsSection[]]),
  values: z.record(z.string(), z.unknown()),
});

export function PUT(req: Request) {
  return handle(async () => {
    await authorize();
    const { section, values } = body.parse(await req.json());
    // Masked secrets coming back from the form mean "unchanged".
    const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== MASK));
    await updateSettings(section, clean);
    return redactSettings(await getSettings());
  });
}
