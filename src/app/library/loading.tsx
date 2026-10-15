import { JarLoader } from "@/components/AppIcon";

/** Shown under the library switcher while a library loads. */
export default function LibraryLoading() {
  return <JarLoader label="Loading library…" className="py-24" />;
}
