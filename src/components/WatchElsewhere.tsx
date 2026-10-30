"use client";

/** The clipboard API needs https; Jellyshelf is often plain http, where only the old execCommand copy works. */
function copy(text: string) {
  if (window.isSecureContext && navigator.clipboard) return void navigator.clipboard.writeText(text).catch(() => {});
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.append(el);
  el.select();
  document.execCommand("copy");
  el.remove();
}

/** FMHY's streaming list, for anyone who'd rather not wait; copies the title on the way, ready to paste into a site's search. */
export function WatchElsewhere({ title, anime }: { title: string; anime?: boolean }) {
  return (
    <a
      className="text-accent hover:underline"
      href={`https://fmhy.net/video#${anime ? "anime-streaming" : "streaming-sites"}`}
      target="_blank"
      rel="noreferrer"
      title={`Copies “${title}” to paste into a site's search`}
      onClick={() => copy(title)}
    >
      Don&apos;t want to wait?
    </a>
  );
}
