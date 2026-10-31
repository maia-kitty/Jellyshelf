import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { mangarr } from "@/lib/clients/mangarr";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; chapter: string; page: string }> };

/** One page image of a manga chapter, relayed from Mangarr for signed-in users (the reader's <img> src). */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await currentUser())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const p = await params;
  const id = Number(p.id);
  const chapter = Number(p.chapter);
  const page = Number(p.page);
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(chapter) || chapter < 0 || !Number.isInteger(page) || page < 0)
    return NextResponse.json({ error: "Bad page" }, { status: 400 });
  const s = (await getSettings()).mangarr;
  if (!s.url) return NextResponse.json({ error: "Mangarr isn't set up" }, { status: 404 });
  const res = await mangarr(s)
    .page(id, chapter, page)
    .catch(() => null);
  if (!res?.ok || !res.body) return NextResponse.json({ error: "Page not available" }, { status: res?.status === 404 ? 404 : 502 });
  return new Response(res.body, {
    headers: { "Content-Type": res.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "private, max-age=604800, immutable" },
  });
}
