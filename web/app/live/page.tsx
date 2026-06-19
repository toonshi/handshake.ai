"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface DemoUser {
  id: string;
  name: string;
  role: string;
  description: string;
  telegram_username?: string;
}

interface AgentBubble {
  agent: "A" | "B";
  name: string;
  turn: number;
  text: string;
  done: boolean;
}

interface LiveResult {
  agentAScore: number;
  agentBScore: number;
  rationale: string;
  conversationStarter: string;
  collaborationOpportunities: string[];
  sharedTechStack: string[];
  matchId: string | null;
}

type Phase = "idle" | "scanning" | "negotiating" | "scoring" | "done" | "error";

const PHASE_LABELS: Record<Phase, string> = {
  idle: "Ready",
  scanning: "Scanning profiles…",
  negotiating: "Agents negotiating…",
  scoring: "Scoring match…",
  done: "Match complete",
  error: "Error",
};

export default function LivePage() {
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [userAId, setUserAId] = useState("");
  const [userBId, setUserBId] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [bubbles, setBubbles] = useState<AgentBubble[]>([]);
  const [result, setResult] = useState<LiveResult | null>(null);
  const [consentStatus, setConsentStatus] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => {
        setUsers(d.users ?? []);
        if (d.users?.length >= 2) {
          setUserAId(d.users[0].id);
          setUserBId(d.users[1].id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles]);

  async function startNegotiation() {
    if (!userAId || !userBId || userAId === userBId) return;
    setBubbles([]);
    setResult(null);
    setError(null);
    setConsentStatus("idle");
    setPhase("scanning");

    try {
      const response = await fetch("/api/negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAId, userBId }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let pendingEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            pendingEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && pendingEvent) {
            try {
              const payload = JSON.parse(line.slice(6));
              handleEvent(pendingEvent, payload);
            } catch {
              // malformed
            }
            pendingEvent = "";
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("error");
    }
  }

  function handleEvent(event: string, payload: Record<string, unknown>) {
    switch (event) {
      case "phase": {
        const p = payload.phase as string;
        if (p === "scanning") setPhase("scanning");
        else if (p === "negotiating") setPhase("negotiating");
        else if (p === "scoring") setPhase("scoring");
        break;
      }
      case "turn_start": {
        const { agent, name, turn } = payload as { agent: "A" | "B"; name: string; turn: number };
        setBubbles((prev) => [...prev, { agent, name, turn, text: "", done: false }]);
        break;
      }
      case "token": {
        const { agent, text } = payload as { agent: "A" | "B"; text: string };
        setBubbles((prev) => {
          const copy = [...prev];
          // Find the last bubble for this agent that isn't done
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].agent === agent && !copy[i].done) {
              copy[i] = { ...copy[i], text: copy[i].text + text };
              break;
            }
          }
          return copy;
        });
        break;
      }
      case "turn_end": {
        const { agent } = payload as { agent: "A" | "B" };
        setBubbles((prev) => {
          const copy = [...prev];
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].agent === agent && !copy[i].done) {
              copy[i] = { ...copy[i], done: true };
              break;
            }
          }
          return copy;
        });
        break;
      }
      case "result": {
        setResult(payload as unknown as LiveResult);
        setPhase("done");
        break;
      }
      case "error": {
        setError((payload.message as string) ?? "Unknown error");
        setPhase("error");
        break;
      }
    }
  }

  async function handleConsent() {
    if (!result?.matchId) return;
    setConsentStatus("loading");
    try {
      const res = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: result.matchId }),
      });
      if (!res.ok) throw new Error("Failed");
      setConsentStatus("done");
    } catch {
      setConsentStatus("idle");
    }
  }

  function reset() {
    setBubbles([]);
    setResult(null);
    setError(null);
    setPhase("idle");
    setConsentStatus("idle");
  }

  const userA = users.find((u) => u.id === userAId);
  const userB = users.find((u) => u.id === userBId);
  const isRunning = phase === "scanning" || phase === "negotiating" || phase === "scoring";

  return (
    <main className="min-h-screen px-4 py-10 sm:py-16">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-mono text-[#52525b] border border-[#27272a] rounded-full px-3 py-1.5">
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${isRunning ? "bg-[#4ade80] animate-pulse" : phase === "done" ? "bg-[#4ade80]" : "bg-[#52525b]"}`} />
              {PHASE_LABELS[phase]}
            </div>
          </div>
          <Link href="/" className="text-xs text-[#52525b] hover:text-white transition-colors">
            ← Back
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-white">Agent Negotiation</h1>
          <p className="text-sm text-[#71717a] mt-1">
            Two AI agents negotiate introductions in real time — you decide whether to connect.
          </p>
        </div>

        {/* User selector */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UserCard
            label="Agent A"
            color="green"
            users={users}
            selectedId={userAId}
            excludeId={userBId}
            onChange={setUserAId}
            user={userA}
            disabled={isRunning}
          />
          <UserCard
            label="Agent B"
            color="indigo"
            users={users}
            selectedId={userBId}
            excludeId={userAId}
            onChange={setUserBId}
            user={userB}
            disabled={isRunning}
          />
        </div>

        {/* Start button */}
        {phase === "idle" && (
          <button
            onClick={startNegotiation}
            disabled={!userAId || !userBId || userAId === userBId}
            className="w-full bg-white text-black font-medium text-sm rounded-xl py-3 px-4 hover:bg-[#ededed] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Start Agent Negotiation →
          </button>
        )}

        {/* Phase progress bar */}
        {phase !== "idle" && (
          <div className="flex items-center gap-2">
            {(["scanning", "negotiating", "scoring", "done"] as const).map((p, i) => {
              const phases = ["scanning", "negotiating", "scoring", "done"];
              const currentIdx = phases.indexOf(phase === "error" ? "done" : phase);
              const isActive = i <= currentIdx;
              return (
                <div key={p} className="flex items-center gap-2 flex-1">
                  <div className={`h-1 flex-1 rounded-full transition-colors ${isActive ? "bg-[#4ade80]" : "bg-[#27272a]"}`} />
                  {i === phases.length - 1 && null}
                </div>
              );
            })}
          </div>
        )}

        {/* Chat area */}
        {bubbles.length > 0 && (
          <div className="border border-[#27272a] rounded-2xl bg-[#0a0a0a] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#27272a] flex items-center justify-between">
              <p className="text-xs font-mono text-[#52525b]">Agent conversation</p>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-[#4ade80]">
                  <span className="w-2 h-2 rounded-full bg-[#4ade80] inline-block" />
                  {userA?.name ?? "Agent A"}
                </span>
                <span className="flex items-center gap-1.5 text-[#818cf8]">
                  <span className="w-2 h-2 rounded-full bg-[#818cf8] inline-block" />
                  {userB?.name ?? "Agent B"}
                </span>
              </div>
            </div>

            <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
              {bubbles.map((bubble, i) => (
                <div
                  key={i}
                  className={`flex ${bubble.agent === "A" ? "justify-start" : "justify-end"}`}
                >
                  <div className={`max-w-[85%] space-y-1 ${bubble.agent === "B" ? "items-end flex flex-col" : ""}`}>
                    <p className={`text-[10px] font-mono px-1 ${bubble.agent === "A" ? "text-[#4ade80]" : "text-[#818cf8]"}`}>
                      {bubble.name} · Turn {bubble.turn}
                    </p>
                    <div className={`rounded-xl px-4 py-3 text-sm text-[#e4e4e7] leading-relaxed border ${bubble.agent === "A" ? "bg-[#0d1f0d] border-[#166534]" : "bg-[#0f0f1f] border-[#312e81]"}`}>
                      {bubble.text}
                      {!bubble.done && (
                        <span className="inline-block w-0.5 h-4 bg-white ml-0.5 animate-pulse align-text-bottom" />
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {phase === "scoring" && (
                <div className="flex justify-center py-2">
                  <div className="flex items-center gap-2 text-xs text-[#71717a] border border-[#27272a] rounded-full px-4 py-2 bg-[#111111]">
                    <span className="w-3 h-3 border border-[#52525b] border-t-white rounded-full animate-spin inline-block" />
                    Agents scoring the match…
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>
        )}

        {/* Result card */}
        {result && (
          <div className="border border-[#27272a] rounded-2xl bg-[#111111] overflow-hidden space-y-0">
            {/* Scores */}
            <div className="px-5 py-4 border-b border-[#27272a]">
              <p className="text-xs font-mono text-[#52525b] mb-3">Match scores</p>
              <div className="grid grid-cols-2 gap-4">
                <ScoreBar label={userA?.name ?? "Agent A"} score={result.agentAScore} color="green" />
                <ScoreBar label={userB?.name ?? "Agent B"} score={result.agentBScore} color="indigo" />
              </div>
            </div>

            {/* Tech stack */}
            {result.sharedTechStack.length > 0 && (
              <div className="px-5 py-4 border-b border-[#27272a]">
                <p className="text-xs font-mono text-[#52525b] mb-2">Shared / complementary tech</p>
                <div className="flex flex-wrap gap-2">
                  {result.sharedTechStack.map((t) => (
                    <span key={t} className="text-xs text-[#a1a1aa] bg-[#18181b] border border-[#27272a] rounded-lg px-2.5 py-1">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Collaboration opportunities */}
            {result.collaborationOpportunities.length > 0 && (
              <div className="px-5 py-4 border-b border-[#27272a]">
                <p className="text-xs font-mono text-[#52525b] mb-2">Collaboration opportunities</p>
                <ul className="space-y-1.5">
                  {result.collaborationOpportunities.map((o) => (
                    <li key={o} className="text-sm text-[#a1a1aa] flex items-start gap-2">
                      <span className="text-[#4ade80] mt-0.5 shrink-0">→</span>
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Rationale */}
            <div className="px-5 py-4 border-b border-[#27272a]">
              <p className="text-xs font-mono text-[#52525b] mb-2">Why this match</p>
              <p className="text-sm text-[#a1a1aa] leading-relaxed">{result.rationale}</p>
            </div>

            {/* Conversation starter */}
            {result.conversationStarter && (
              <div className="px-5 py-4 border-b border-[#27272a]">
                <p className="text-xs font-mono text-[#52525b] mb-2">Open with</p>
                <p className="text-sm text-white italic">&ldquo;{result.conversationStarter}&rdquo;</p>
              </div>
            )}

            {/* Actions */}
            <div className="px-5 py-4">
              {consentStatus === "done" ? (
                <div className="flex items-center gap-2 text-sm text-[#4ade80]">
                  <span>✓</span>
                  <span>Connected — both users will receive a Telegram message with each other&apos;s contact details.</span>
                </div>
              ) : (
                <div className="flex gap-3">
                  {result.matchId ? (
                    <button
                      onClick={handleConsent}
                      disabled={consentStatus === "loading"}
                      className="flex-1 bg-white text-black font-medium text-sm rounded-xl py-2.5 px-4 hover:bg-[#ededed] disabled:opacity-50 transition-colors"
                    >
                      {consentStatus === "loading" ? "Connecting…" : "✅ Connect them →"}
                    </button>
                  ) : (
                    <div className="flex-1 text-center text-xs text-[#52525b] py-2.5">
                      Scores below threshold — no match saved.
                    </div>
                  )}
                  <button
                    onClick={reset}
                    className="bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] text-[#a1a1aa] text-sm rounded-xl py-2.5 px-4 transition-colors"
                  >
                    ↺ Run again
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error state */}
        {phase === "error" && error && (
          <div className="border border-[#7f1d1d] bg-[#450a0a] rounded-xl px-4 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-[#f87171]">{error}</p>
            <button onClick={reset} className="text-xs text-[#f87171] hover:text-white transition-colors shrink-0">Try again</button>
          </div>
        )}

      </div>
    </main>
  );
}

function UserCard({
  label,
  color,
  users,
  selectedId,
  excludeId,
  onChange,
  user,
  disabled,
}: {
  label: string;
  color: "green" | "indigo";
  users: DemoUser[];
  selectedId: string;
  excludeId: string;
  onChange: (id: string) => void;
  user?: DemoUser;
  disabled: boolean;
}) {
  const accent = color === "green" ? "text-[#4ade80]" : "text-[#818cf8]";
  const border = color === "green" ? "border-[#166534]" : "border-[#312e81]";
  const bg = color === "green" ? "bg-[#0d1f0d]" : "bg-[#0f0f1f]";

  return (
    <div className={`border rounded-xl p-4 space-y-3 ${user ? `${border} ${bg}` : "border-[#27272a] bg-[#111111]"}`}>
      <p className={`text-xs font-mono ${accent}`}>{label}</p>
      <select
        className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white appearance-none"
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">Select a user…</option>
        {users
          .filter((u) => u.id !== excludeId)
          .map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} · {u.role}
            </option>
          ))}
      </select>
      {user && (
        <p className="text-xs text-[#71717a] leading-relaxed line-clamp-3">{user.description}</p>
      )}
    </div>
  );
}

function ScoreBar({
  label,
  score,
  color,
}: {
  label: string;
  score: number;
  color: "green" | "indigo";
}) {
  const pct = Math.round(score * 100);
  const barColor = score >= 0.72 ? (color === "green" ? "bg-[#4ade80]" : "bg-[#818cf8]") : score >= 0.5 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#a1a1aa] truncate max-w-[80%]">{label}</p>
        <p className={`text-sm font-semibold tabular-nums ${score >= 0.72 ? (color === "green" ? "text-[#4ade80]" : "text-[#818cf8]") : "text-[#a1a1aa]"}`}>
          {pct}%
        </p>
      </div>
      <div className="h-1.5 bg-[#27272a] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
