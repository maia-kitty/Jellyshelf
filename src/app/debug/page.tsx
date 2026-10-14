import Link from "next/link";
import { AnimationLab } from "@/components/AnimationLab";
import { debugOptions } from "@/lib/debug";
import { pageAdmin } from "@/lib/page";

export default async function DebugPage() {
  await pageAdmin();
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <Link href="/settings" className="text-sm text-muted hover:text-fg">
          ← Settings
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Debug</h1>
        <p className="text-sm text-muted">Every animation in the app, with replay, pause, scrubbing and slow motion.</p>
      </div>
      <AnimationLab debug={await debugOptions()} />
    </div>
  );
}
