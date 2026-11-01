import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { mangarr } from "@/lib/clients/mangarr";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; chapter: string }> };

/** A whole chapter as a CBZ, relayed from Mangarr for signed-in users: the Android app downloads these to read offline. */
export async function GET(req: Request, { params }: Ctx) {
  if (!(await currentUser())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const p = await params;
  const id = Number(p.id);
  const chapter = Number(p.chapter);
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(chapter) || chapter < 0) return NextResponse.json({ error: "Bad chapter" }, { status: 400 });
  const s = (await getSettings()).mangarr;
  if (!s.url) return NextResponse.json({ error: "Mangarr isn't set up" }, { status: 404 });
  const res = await mangarr(s)
    .file(id, chapter, req.signal)
    .catch(() => null);
  if (!res?.ok || !res.body) return NextResponse.json({ error: "Chapter not available" }, { status: res?.status === 404 ? 404 : 502 });
  const headers = new Headers({ "Content-Type": "application/vnd.comicbook+zip", "Cache-Control": "private, no-store" });
  const length = res.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new Response(res.body, { headers });
}
