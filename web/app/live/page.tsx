"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SiteHeader from "@/components/site-header";
import CompatibilityScore from "@/components/compatibility-score";
import ScoreBar from "@/components/ui/score-bar";
import { Button } from "@/components/ui/button";
import { MATCH_THRESHOLD } from "@/lib/constants";

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
type ConsentStatus = "idle" | "loading" | "done" | "error";

const PHASE_LABELS: Record<Phase, string> = {
  idle: "Ready",
  scanning: "Scanning profiles…",
  negotiating: "Agents negotiating…",
  scoring: "Scoring match…",
  done: "Match complete",
  error: "Error",
};

const STEPS = [
  { key: "scanning", label: "Scan" },
  { key: "negotiating", label: "Negotiate" },
  { key: "scoring", label: "Score" },
  { key: "done", label: "Result" },
] as const;

export default function LivePage() {
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userAId, setUserAId] = useState("");
  const [userBId, setUserBId] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [bubbles, setBubbles] = useState<AgentBubble[]>([]);
  const [result, setResult] = useState<LiveResult | null>(null);
  const [consentStatus, setConsentStatus] = useState<ConsentStatus>("idle");
  const [consentError, setConsentError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const r = await fetch("/api/users");
      const d = await r.json();
      const list = d.users ?? [];
      setUsers(list);
      if (list.length >= 2) {
        setUserAId(list[0].id);
        setUserBId(list[1].id);
      }
    } catch {
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles]);

  async function seedDemo() {
    setSeeding(true);
    try {
      await fetch("/api/seed-demo", { method: "POST" });
      await loadUsers();
    } finally {
      setSeeding(false);
    }
  }

  async function startNegotiation() {
    if (!userAId || !userBId || userAId === userBId) return;
    setBubbles([]);
    setResult(null);
    setError(null);
    setConsentStatus("idle");
    setConsentError(null);
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
              // malformed SSE chunk
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
    setConsentError(null);
    try {
      const res = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: result.matchId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to connect");
      setConsentStatus("done");
    } catch (err) {
      setConsentStatus("error");
      setConsentError(err instanceof Error ? err.message : "Connection failed");
    }
  }

  function reset() {
    setBubbles([]);
    setResult(null);
    setError(null);
    setPhase("idle");
    setConsentStatus("idle");
    setConsentError(null);
  }

  const userA = users.find((u) => u.id === userAId);
  const userB = users.find((u) => u.id === userBId);
  const isRunning = phase === "scanning" || phase === "negotiating" || phase === "scoring";
  const canStart = userAId && userBId && userAId !== userBId && !isRunning;
  const matchQualified =
    result &&
    result.agentAScore >= MATCH_THRESHOLD &&
    result.agentBScore >= MATCH_THRESHOLD &&
    result.matchId;

  const currentStepIdx = STEPS.findIndex((s) => s.key === (phase === "error" ? "done" : phase));

  return (
  <>
    <div className="page-bg" />
    <div className="page-content min-h-screen">
      <SiteHeader active="live" />

      <main className="px-4 py-8 sm:py-12">
        <div className="max-w-4xl mx-auto space-y-8">

          {/* Hero */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <StatusBadge phase={phase} isRunning={isRunning} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
              Agent negotiation
            </h1>
            <p className="text-sm text-[var(--muted)] max-w-2xl leading-relaxed">
              Pick two community members. Their AI agents negotiate introductions in real time.
              When compatibility clears the bar, you connect them — just like the Telegram flow.
            </p>
          </div>

          {/* Empty / loading state */}
          {usersLoading ? (
            <div className="card p-8 flex items-center justify-center gap-3 text-sm text-[var(--muted)]">
              <Spinner />
              Loading users…
            </div>
          ) : users.length < 2 ? (
            <EmptyUsersState onSeed={seedDemo} seeding={seeding} />
          ) : (
            <>
              {/* User selectors */}
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

              {/* VS divider when both selected */}
              {userA && userB && phase === "idle" && (
                <div className="flex items-center gap-3 text-xs text-[#52525b] font-mono">
                  <span className="flex-1 h-px bg-[var(--border)]" />
                  <span>{userA.name} vs {userB.name}</span>
                  <span className="flex-1 h-px bg-[var(--border)]" />
                </div>
              )}

              {/* Start */}
              {phase === "idle" && (
                <Button fullWidth onClick={startNegotiation} disabled={!canStart}>
                  Start agent negotiation →
                </Button>
              )}

              {/* Step progress */}
              {phase !== "idle" && (
                <div className="space-y-2">
                  <div className="flex gap-1">
                    {STEPS.map((step, i) => {
                      const active = i <= currentStepIdx;
                      return (
                        <div key={step.key} className="flex-1 space-y-1.5">
                          <div
                            className={`h-1 rounded-full transition-all duration-500 ${
                              active ? "bg-[var(--success)]" : "bg-[var(--border)]"
                            }`}
                          />
                          <p
                            className={`text-[10px] font-mono text-center ${
                              active ? "text-[var(--success)]" : "text-[#52525b]"
                            }`}
                          >
                            {step.label}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Chat */}
              {bubbles.length > 0 && (
                <div className="card overflow-hidden animate-fade-up">
                  <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-4">
                    <p className="text-xs font-mono text-[#52525b]">Live conversation</p>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1.5 text-[var(--agent-a)]">
                        <span className="w-2 h-2 rounded-full bg-[var(--agent-a)]" />
                        {userA?.name ?? "Agent A"}
                      </span>
                      <span className="text-[#52525b]">↔</span>
                      <span className="flex items-center gap-1.5 text-[var(--agent-b)]">
                        <span className="w-2 h-2 rounded-full bg-[var(--agent-b)]" />
                        {userB?.name ?? "Agent B"}
                      </span>
                    </div>
                  </div>

                  <div
                    className="p-4 space-y-4 max-h-[480px] overflow-y-auto"
                    aria-live="polite"
                    aria-label="Agent conversation"
                  >
                    {bubbles.map((bubble, i) => (
                      <div
                        key={i}
                        className={`flex ${bubble.agent === "A" ? "justify-start" : "justify-end"}`}
                      >
                        <div
                          className={`max-w-[88%] space-y-1 ${
                            bubble.agent === "B" ? "items-end flex flex-col" : ""
                          }`}
                        >
                          <p
                            className={`text-[10px] font-mono px-1 ${
                              bubble.agent === "A" ? "text-[var(--agent-a)]" : "text-[var(--agent-b)]"
                            }`}
                          >
                            {bubble.name} · Turn {bubble.turn}
                          </p>
                          <div
                            className={`rounded-2xl px-4 py-3 text-sm text-[#e4e4e7] leading-relaxed border ${
                              bubble.agent === "A"
                                ? "bg-[#0d1f0d] border-[#166534]/60 rounded-tl-sm"
                                : "bg-[#0f0f1f] border-[#312e81]/60 rounded-tr-sm"
                            }`}
                          >
                            {bubble.text}
                            {!bubble.done && (
                              <span className="inline-block w-0.5 h-4 bg-white ml-0.5 cursor-blink align-text-bottom" />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {phase === "scoring" && (
                      <div className="flex justify-center py-3">
                        <div className="flex items-center gap-2 text-xs text-[var(--muted)] border border-[var(--border)] rounded-full px-4 py-2 bg-[var(--surface-2)]">
                          <Spinner />
                          Agents scoring compatibility…
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                </div>
              )}

              {/* Results */}
              {result && (
                <div className="card overflow-hidden animate-fade-up space-y-0">
                  {/* Compatibility hero */}
                  <div className="px-5 sm:px-6 py-6 border-b border-[var(--border)] bg-[var(--surface-2)]/30">
                    <CompatibilityScore
                      agentAScore={result.agentAScore}
                      agentBScore={result.agentBScore}
                      userAName={userA?.name}
                      userBName={userB?.name}
                    />
                  </div>

                  {/* Individual scores */}
                  <div className="px-5 sm:px-6 py-5 border-b border-[var(--border)]">
                    <p className="card-header !px-0 !py-0 !border-0 mb-4">Agent scores</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <ScoreBar label={userA?.name ?? "Agent A"} score={result.agentAScore} color="green" />
                      <ScoreBar label={userB?.name ?? "Agent B"} score={result.agentBScore} color="indigo" />
                    </div>
                  </div>

                  {result.sharedTechStack.length > 0 && (
                    <div className="px-5 sm:px-6 py-5 border-b border-[var(--border)]">
                      <p className="card-header !px-0 !py-0 !border-0 mb-3">Shared / complementary tech</p>
                      <div className="flex flex-wrap gap-2">
                        {result.sharedTechStack.map((t) => (
                          <span
                            key={t}
                            className="text-xs text-[var(--muted)] bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2.5 py-1"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.collaborationOpportunities.length > 0 && (
                    <div className="px-5 sm:px-6 py-5 border-b border-[var(--border)]">
                      <p className="card-header !px-0 !py-0 !border-0 mb-3">Collaboration opportunities</p>
                      <ul className="space-y-2">
                        {result.collaborationOpportunities.map((o) => (
                          <li key={o} className="text-sm text-[var(--muted)] flex items-start gap-2">
                            <span className="text-[var(--success)] mt-0.5 shrink-0">→</span>
                            {o}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="px-5 sm:px-6 py-5 border-b border-[var(--border)]">
                    <p className="card-header !px-0 !py-0 !border-0 mb-3">Why this match</p>
                    <p className="text-sm text-[var(--muted)] leading-relaxed">{result.rationale}</p>
                  </div>

                  {result.conversationStarter && (
                    <div className="px-5 sm:px-6 py-5 border-b border-[var(--border)]">
                      <p className="card-header !px-0 !py-0 !border-0 mb-3">Open with</p>
                      <blockquote className="text-sm text-white italic border-l-2 border-[var(--success)] pl-4">
                        &ldquo;{result.conversationStarter}&rdquo;
                      </blockquote>
                    </div>
                  )}

                  {/* Connect actions */}
                  <div className="px-5 sm:px-6 py-5">
                    {consentStatus === "done" ? (
                      <div className="flex items-start gap-3 p-4 rounded-xl bg-[#052e16] border border-[#166534]/50 animate-fade-up">
                        <span className="w-8 h-8 rounded-full bg-[var(--success)]/20 flex items-center justify-center text-[var(--success)] shrink-0">
                          ✓
                        </span>
                        <div>
                          <p className="text-sm font-medium text-[var(--success)]">Connected</p>
                          <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">
                            Both users will receive a Telegram message with each other&apos;s contact details
                            {userA?.telegram_username || userB?.telegram_username
                              ? " and may get a voice briefing call."
                              : "."}
                          </p>
                        </div>
                      </div>
                    ) : matchQualified ? (
                      <div className="space-y-3">
                        <p className="text-xs text-[var(--muted)]">
                          Demo shortcut: connects both users instantly (production uses per-user Telegram consent).
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <Button
                            variant="success"
                            fullWidth
                            onClick={handleConsent}
                            disabled={consentStatus === "loading"}
                            className="sm:flex-1 py-3"
                          >
                            {consentStatus === "loading" ? (
                              <span className="flex items-center gap-2">
                                <Spinner dark />
                                Connecting…
                              </span>
                            ) : (
                              <>Connect them →</>
                            )}
                          </Button>
                          <Button variant="secondary" onClick={reset} className="sm:w-auto">
                            ↺ Run again
                          </Button>
                        </div>
                        {consentStatus === "error" && consentError && (
                          <p className="text-sm text-[var(--error)] bg-[#450a0a] border border-[#7f1d1d] rounded-lg px-4 py-3">
                            {consentError}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                          <span className="text-[var(--muted)] shrink-0">—</span>
                          <p className="text-sm text-[var(--muted)] leading-relaxed">
                            Scores below the {Math.round(MATCH_THRESHOLD * 100)}% threshold — no match saved.
                            Try different profiles or run again.
                          </p>
                        </div>
                        <Button variant="secondary" fullWidth onClick={reset}>
                          ↺ Try different pairing
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {phase === "error" && error && (
                <div className="border border-[#7f1d1d] bg-[#450a0a] rounded-xl px-4 py-3 flex items-center justify-between gap-4 animate-fade-up">
                  <p className="text-sm text-[var(--error)]">{error}</p>
                  <button
                    onClick={reset}
                    className="text-xs text-[var(--error)] hover:text-white transition-colors shrink-0"
                  >
                    Try again
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  </>
  );
}

function StatusBadge({ phase, isRunning }: { phase: Phase; isRunning: boolean }) {
  return (
    <div className="inline-flex items-center gap-2 text-xs font-mono text-[#52525b] border border-[var(--border)] rounded-full px-3 py-1.5 bg-[var(--surface)]">
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          isRunning
            ? "bg-[var(--success)] animate-pulse"
            : phase === "done"
              ? "bg-[var(--success)]"
              : phase === "error"
                ? "bg-[var(--error)]"
                : "bg-[#52525b]"
        }`}
      />
      {PHASE_LABELS[phase]}
    </div>
  );
}

function EmptyUsersState({
  onSeed,
  seeding,
}: {
  onSeed: () => void;
  seeding: boolean;
}) {
  return (
    <div className="card p-8 sm:p-10 text-center space-y-5">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-2xl text-[#52525b]">
        ∅
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-white">No users to match yet</h2>
        <p className="text-sm text-[var(--muted)] max-w-sm mx-auto leading-relaxed">
          Register at least two people, or load demo personas to try the live negotiation.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button variant="success" onClick={onSeed} disabled={seeding}>
          {seeding ? (
            <span className="flex items-center gap-2">
              <Spinner dark />
              Seeding…
            </span>
          ) : (
            "Load demo personas"
          )}
        </Button>
        <Button variant="secondary" onClick={() => (window.location.href = "/")}>
          Register someone →
        </Button>
      </div>
    </div>
  );
}

function Spinner({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={`w-3.5 h-3.5 border rounded-full animate-spin inline-block shrink-0 ${
        dark ? "border-black/30 border-t-black" : "border-[#52525b] border-t-white"
      }`}
    />
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
  const accent = color === "green" ? "text-[var(--agent-a)]" : "text-[var(--agent-b)]";
  const border = color === "green" ? "border-[#166534]/50" : "border-[#312e81]/50";
  const bg = color === "green" ? "bg-[#0d1f0d]/40" : "bg-[#0f0f1f]/40";
  const dot = color === "green" ? "bg-[var(--agent-a)]" : "bg-[var(--agent-b)]";

  return (
    <div
      className={`border rounded-2xl p-4 space-y-3 transition-colors ${
        user ? `${border} ${bg}` : "border-[var(--border)] bg-[var(--surface)]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <p className={`text-xs font-mono uppercase tracking-wider ${accent}`}>{label}</p>
      </div>
      <select
        className="input appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="space-y-1">
          <p className="text-xs font-medium text-white">{user.role}</p>
          <p className="text-xs text-[#71717a] leading-relaxed line-clamp-3">{user.description}</p>
        </div>
      )}
    </div>
  );
}
