import { JarChip } from "@/components/AppIcon";

/** Shown under the library switcher while a library loads. */
export default function LibraryLoading() {
  return (
    <div className="flex justify-center">
      <JarChip label="Loading library…" />
    </div>
  );
}
