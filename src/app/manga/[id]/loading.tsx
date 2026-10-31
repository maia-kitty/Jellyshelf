import { PageLoading } from "@/components/NavProgress";

/**
 * Its own loading screen, so going from one title to another swaps the page straight away. Without it the old title
 * stayed up until the new one was complete, and that could take many seconds after its data had arrived.
 */
export default function MangaLoading() {
  return <PageLoading />;
}
