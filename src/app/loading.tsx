import { JarLoader } from "@/components/AppIcon";

/** Shown while a page's data loads (route navigation). */
export default function Loading() {
  return <JarLoader label="Loading…" className="py-32" />;
}
