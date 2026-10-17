/** First character as people see it: "🦊 Kit" → "🦊", not half of the emoji ("Kit"[0] style indexing splits it). */
export function initial(name: string) {
  const seg = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter().segment(name)[Symbol.iterator]().next().value?.segment : undefined;
  return seg ?? [...name][0] ?? "";
}
