import { JarChip } from "@/components/AppIcon";

/** Shown while a page's data loads (route navigation). Same spot and look as the jar for slow clicks (NavProgress). */
export default function Loading() {
  return (
    <div className="flex justify-center">
      <JarChip />
    </div>
  );
}
