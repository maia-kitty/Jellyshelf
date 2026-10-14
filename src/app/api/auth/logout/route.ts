import { handle } from "@/lib/api";
import { getSession } from "@/lib/auth";

export function POST() {
  return handle(async () => {
    const session = await getSession();
    session.destroy();
    return { ok: true };
  });
}
