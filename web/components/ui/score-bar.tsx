import { MATCH_THRESHOLD } from "@/lib/constants";

type AgentColor = "green" | "indigo";

const colorMap: Record<
  AgentColor,
  { pass: string; text: string; glow: string }
> = {
  green: {
    pass: "bg-[var(--success)]",
    text: "text-[var(--success)]",
    glow: "shadow-[0_0_8px_rgba(74,222,128,0.4)]",
  },
  indigo: {
    pass: "bg-[#818cf8]",
    text: "text-[#818cf8]",
    glow: "shadow-[0_0_8px_rgba(129,140,248,0.4)]",
  },
};

function barColor(score: number, color: AgentColor): string {
  const c = colorMap[color];
  if (score >= MATCH_THRESHOLD) return `${c.pass} ${c.glow}`;
  if (score >= 0.5) return "bg-yellow-400";
  return "bg-red-400";
}

export default function ScoreBar({
  label,
  score,
  color,
  showThreshold = true,
}: {
  label: string;
  score: number;
  color: AgentColor;
  showThreshold?: boolean;
}) {
  const pct = Math.round(score * 100);
  const passed = score >= MATCH_THRESHOLD;
  const c = colorMap[color];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-[var(--muted)] truncate">{label}</p>
        <div className="flex items-center gap-2 shrink-0">
          {passed && (
            <span className="text-[10px] font-mono uppercase tracking-wide text-[var(--success)] bg-[var(--success)]/10 border border-[var(--success)]/20 rounded px-1.5 py-0.5">
              Pass
            </span>
          )}
          <p
            className={`text-sm font-semibold tabular-nums ${passed ? c.text : "text-[var(--muted)]"}`}
          >
            {pct}%
          </p>
        </div>
      </div>
      <div className="relative h-2 bg-[var(--border)] rounded-full overflow-hidden">
        {showThreshold && (
          <div
            className="absolute top-0 bottom-0 w-px bg-white/30 z-10"
            style={{ left: `${MATCH_THRESHOLD * 100}%` }}
            title={`${MATCH_THRESHOLD * 100}% threshold`}
          />
        )}
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${barColor(score, color)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
