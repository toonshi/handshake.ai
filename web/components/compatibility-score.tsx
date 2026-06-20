import { MATCH_THRESHOLD } from "@/lib/constants";

export function getCompatibilityScore(agentA: number, agentB: number): number {
  return Math.min(agentA, agentB);
}

export default function CompatibilityScore({
  agentAScore,
  agentBScore,
  userAName,
  userBName,
}: {
  agentAScore: number;
  agentBScore: number;
  userAName?: string;
  userBName?: string;
}) {
  const compatibility = getCompatibilityScore(agentAScore, agentBScore);
  const pct = Math.round(compatibility * 100);
  const thresholdPct = Math.round(MATCH_THRESHOLD * 100);
  const passed = agentAScore >= MATCH_THRESHOLD && agentBScore >= MATCH_THRESHOLD;
  const ringColor = passed ? "var(--success)" : compatibility >= 0.5 ? "#facc15" : "#f87171";

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
      {/* Ring gauge */}
      <div className="relative shrink-0">
        <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke="var(--border)"
            strokeWidth="8"
          />
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke={ringColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${compatibility * 326.7} 326.7`}
            className="transition-all duration-700 ease-out"
            style={{ filter: passed ? "drop-shadow(0 0 8px rgba(74,222,128,0.5))" : undefined }}
          />
          {/* Threshold marker on ring */}
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`2 324.7`}
            strokeDashoffset={-MATCH_THRESHOLD * 326.7}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tabular-nums text-white">{pct}%</span>
          <span className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-widest mt-0.5">
            compat
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-3 text-center sm:text-left">
        <div>
          <h3 className="text-base font-semibold text-white">Compatibility score</h3>
          <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">
            {passed
              ? "Both agents rated this match above the threshold — ready to connect."
              : compatibility < MATCH_THRESHOLD
                ? `Below the ${thresholdPct}% bar. Both sides must independently agree for a match.`
                : `One side passed, but both need to exceed ${thresholdPct}%.`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
          <AgentPill name={userAName ?? "Agent A"} score={agentAScore} color="green" />
          <AgentPill name={userBName ?? "Agent B"} score={agentBScore} color="indigo" />
        </div>

        <p className="text-[10px] font-mono text-[#52525b]">
          Score = min(agent A, agent B) · threshold {thresholdPct}%
        </p>
      </div>
    </div>
  );
}

function AgentPill({
  name,
  score,
  color,
}: {
  name: string;
  score: number;
  color: "green" | "indigo";
}) {
  const passed = score >= MATCH_THRESHOLD;
  const accent = color === "green" ? "text-[var(--success)]" : "text-[#818cf8]";
  const border = color === "green" ? "border-[#166534]/50" : "border-[#312e81]/50";
  const bg = color === "green" ? "bg-[#0d1f0d]/50" : "bg-[#0f0f1f]/50";

  return (
    <span
      className={`inline-flex items-center gap-2 text-xs border rounded-lg px-3 py-1.5 ${border} ${bg}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${passed ? accent : "bg-[#52525b]"}`} />
      <span className="text-[var(--muted)]">{name}</span>
      <span className={`font-semibold tabular-nums ${passed ? accent : "text-[var(--muted)]"}`}>
        {Math.round(score * 100)}%
      </span>
    </span>
  );
}
