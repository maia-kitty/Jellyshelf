import { scoreColor } from "@/lib/scoreColor";

/** A community score (0–100) as "★ 86", coloured on the same scale as your own ratings. */
export function CommunityScore({ score, percent = false, className }: { score: number; percent?: boolean; className?: string }) {
  return (
    <span title="Average score" className={className} style={{ color: scoreColor(score, 100) }}>
      ★ {score}
      {percent && "%"}
    </span>
  );
}
