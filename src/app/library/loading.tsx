import { PageLoading } from "@/components/NavProgress";

/** Shown under the library switcher while a library loads: the header's jar runs, as for any page load. */
export default function LibraryLoading() {
  return <PageLoading label="Loading library…" />;
}
