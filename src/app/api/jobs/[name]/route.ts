import { ApiError, handle } from "@/lib/api";
import { apiUser } from "@/lib/auth";
import { refreshMappings } from "@/lib/mapping";
import { runAvailabilitySync } from "@/lib/jobs/availability";

type Ctx = { params: Promise<{ name: string }> };

export function POST(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await apiUser({ admin: true });
    const { name } = await params;
    if (name === "mappings") return { rows: await refreshMappings() };
    if (name === "availability") return runAvailabilitySync();
    throw new ApiError(404, "Unknown job");
  });
}
