import clsx from "clsx";

/** An on/off switch's look. The control itself is whatever wraps it (a label with a checkbox, a menu item). */
export function Switch({ on, className }: { on: boolean; className?: string }) {
  return (
    <span aria-hidden className={clsx("relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200", on ? "bg-accent" : "bg-line", className)}>
      <span className={clsx("absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200", on && "translate-x-4")} />
    </span>
  );
}
