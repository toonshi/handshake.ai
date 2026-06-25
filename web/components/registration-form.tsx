"use client";

import { useState, useRef, useEffect } from "react";
import { useActiveAccount } from "thirdweb/react";
import WalletConnect from "@/components/wallet-connect";
import { Button } from "@/components/ui/button";
import type { PrefillResult } from "@/app/api/prefill/route";

const ROLES = [
  "Founder / Co-founder",
  "Software Developer",
  "Designer / Product",
  "Investor / VC",
  "Mentor / Advisor",
  "Business / Operations",
  "Student / Researcher",
  "Other",
];

interface FormData {
  name: string;
  telegram_username: string;
  role: string;
  description: string;
  goals: string;
  challenges: string;
  offers: string;
  github_username: string;
  website_url: string;
  phone_number: string;
  wallet_address: string;
  resume: File | null;
}

type Status = "idle" | "loading" | "success" | "error";
type PrefillStatus = "idle" | "loading" | "done" | "error";

export default function RegistrationForm() {
  const [prefillInput, setPrefillInput] = useState("");
  const [prefillStatus, setPrefillStatus] = useState<PrefillStatus>("idle");
  const [prefillError, setPrefillError] = useState("");
  const [prefillSource, setPrefillSource] = useState("");

  const [form, setForm] = useState<FormData>({
    name: "",
    telegram_username: "",
    role: "",
    description: "",
    goals: "",
    challenges: "",
    offers: "",
    github_username: "",
    website_url: "",
    phone_number: "",
    wallet_address: "",
    resume: null,
  });
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const account = useActiveAccount();

  useEffect(() => {
    if (account?.address) {
      setForm((f) => ({ ...f, wallet_address: account.address }));
    }
  }, [account?.address]);

  async function handlePrefill() {
    if (!prefillInput.trim()) return;
    setPrefillStatus("loading");
    setPrefillError("");

    try {
      const res = await fetch("/api/prefill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: prefillInput.trim() }),
      });
      const data = await res.json() as PrefillResult & { error?: string };

      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to fetch profile");

      setForm((f) => ({
        ...f,
        name: data.name || f.name,
        role: data.role || f.role,
        description: data.description || f.description,
        goals: data.goals || f.goals,
        challenges: data.challenges || f.challenges,
        offers: data.offers || f.offers,
        github_username: data.github_username || f.github_username,
        website_url: data.website_url || f.website_url,
      }));

      setPrefillSource(data.source);
      setPrefillStatus("done");
    } catch (err) {
      setPrefillError(err instanceof Error ? err.message : "Failed to fetch profile");
      setPrefillStatus("error");
    }
  }

  const set = (key: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    try {
      const body = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (v && k !== "resume") body.append(k, v as string);
      });
      if (form.resume) body.append("resume", form.resume);

      const res = await fetch("/api/register", { method: "POST", body });
      const json = await res.json();

      if (!res.ok) throw new Error(json.error ?? "Registration failed");
      setStatus("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-6 py-12 text-center">
        <div className="w-14 h-14 rounded-full bg-[#052e16] border border-[#166534] flex items-center justify-center text-2xl">
          ✓
        </div>
        <div>
          <h2 className="text-xl font-semibold text-[#4ade80] mb-2">
            You&apos;re in the room.
          </h2>
          <p className="text-[#a1a1aa] text-sm max-w-sm">
            Your agent is active. Message{" "}
            <a
              href="https://t.me/HandshakeAIBot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white underline underline-offset-2"
            >
              @HandshakeAIBot
            </a>{" "}
            on Telegram to receive match notifications and voice introductions.
          </p>
        </div>
        <div className="mt-2 p-4 rounded-xl border border-[#27272a] bg-[#111111] text-left text-sm text-[#a1a1aa] max-w-sm w-full">
          <p className="text-white font-medium mb-1">What happens next</p>
          <ul className="space-y-1.5 list-none">
            <li>→ Your agent runs every 2 hours</li>
            <li>→ When it finds a match, you get a Telegram message</li>
            <li>→ Confirm and you&apos;ll receive a voice call briefing</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">

      {/* Quick-fill from social profile */}
      <section className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white">Import from a profile</p>
          <p className="text-xs text-[#71717a]">
            Paste your GitHub username or portfolio URL — we&apos;ll fill in the form for you. (LinkedIn blocks automated access.)
          </p>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            className="input flex-1"
            placeholder="github.com/you  ·  yoursite.com  ·  or just: yourusername"
            value={prefillInput}
            onChange={(e) => {
              setPrefillInput(e.target.value);
              if (prefillStatus !== "idle") setPrefillStatus("idle");
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handlePrefill())}
            disabled={prefillStatus === "loading"}
          />
          <button
            type="button"
            onClick={handlePrefill}
            disabled={prefillStatus === "loading" || !prefillInput.trim()}
            className="shrink-0 bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] text-white text-sm font-medium rounded-xl px-4 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {prefillStatus === "loading" ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border border-[#52525b] border-t-white rounded-full animate-spin inline-block" />
                Reading…
              </span>
            ) : "Import →"}
          </button>
        </div>

        {prefillStatus === "done" && (
          <div className="flex items-center gap-2 text-xs text-[#4ade80] bg-[#052e16] border border-[#166534] rounded-lg px-3 py-2">
            <span>✓</span>
            <span>Fields pre-filled from <span className="font-medium">{prefillSource}</span> — review and edit below.</span>
          </div>
        )}
        {prefillStatus === "error" && (
          <p className="text-xs text-[#f87171] bg-[#450a0a] border border-[#7f1d1d] rounded-lg px-3 py-2">
            {prefillError}
          </p>
        )}
      </section>

      <Divider />

      {/* Section 1: Identity */}
      <section className="space-y-4">
        <SectionLabel number="01" title="Who are you?" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full name" required>
            <input
              className="input"
              placeholder="Amina Odhiambo"
              value={form.name}
              onChange={set("name")}
              required
            />
          </Field>

          <Field label="Telegram username" required hint="For match notifications">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#52525b] text-sm select-none">
                @
              </span>
              <input
                className="input pl-7"
                placeholder="aminaodhiambo"
                value={form.telegram_username}
                onChange={set("telegram_username")}
                required
              />
            </div>
          </Field>
        </div>

        <Field label="Your role" required>
          <select className="input" value={form.role} onChange={set("role")} required>
            <option value="" disabled>
              Select your role
            </option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <Divider />

      {/* Section 2: Your work */}
      <section className="space-y-4">
        <SectionLabel number="02" title="Your work" />

        <Field
          label="What are you building or working on?"
          required
          hint="2–3 sentences. Be specific."
        >
          <textarea
            className="input min-h-[88px]"
            placeholder="I'm building an offline-first inventory system for small retailers in Nairobi. We sync conflict resolution across devices without internet..."
            value={form.description}
            onChange={set("description")}
            required
            rows={3}
          />
        </Field>

        <Field
          label="Top goals at MiniHack"
          required
          hint="What do you want to walk away with?"
        >
          <textarea
            className="input min-h-[72px]"
            placeholder="Find a technical co-founder with mobile experience. Get feedback on our pricing model from someone who's sold to SMBs before."
            value={form.goals}
            onChange={set("goals")}
            required
            rows={2}
          />
        </Field>

        <Field
          label="Biggest current challenge"
          required
          hint="This is what your agent leads with when negotiating introductions."
        >
          <textarea
            className="input min-h-[72px]"
            placeholder="We're stuck on sync conflict resolution — specifically how to handle concurrent writes from multiple devices when they reconnect."
            value={form.challenges}
            onChange={set("challenges")}
            required
            rows={2}
          />
        </Field>
      </section>

      <Divider />

      {/* Section 3: What you offer */}
      <section className="space-y-4">
        <SectionLabel number="03" title="What you bring" />

        <Field
          label="What can you offer others?"
          required
          hint="Skills, knowledge, network, capital, domain expertise."
        >
          <textarea
            className="input min-h-[72px]"
            placeholder="5 years building mobile apps in Kenya. Strong network in the Nairobi retail sector. I can intro people to 3 angel investors I know personally."
            value={form.offers}
            onChange={set("offers")}
            required
            rows={2}
          />
        </Field>

        <Field label="Phone number" hint="Optional — for ElevenLabs voice introductions">
          <input
            className="input"
            placeholder="+254712345678"
            value={form.phone_number}
            onChange={set("phone_number")}
            type="tel"
          />
        </Field>

        <Field label="Avalanche wallet" hint="Optional — connect or paste manually">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="input flex-1"
              placeholder="0x…"
              value={form.wallet_address}
              onChange={set("wallet_address")}
            />
            <WalletConnect />
          </div>
        </Field>
      </section>

      <Divider />

      {/* Section 4: Enrichments */}
      <section className="space-y-4">
        <SectionLabel
          number="04"
          title="Boost your agent"
          subtitle="Optional — each source makes your agent's introductions more specific and credible."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="GitHub username" hint="Public repos, top languages">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#52525b] text-sm select-none">
                github.com/
              </span>
              <input
                className="input pl-[92px]"
                placeholder="aminaodhiambo"
                value={form.github_username}
                onChange={set("github_username")}
              />
            </div>
          </Field>

          <Field label="Portfolio or startup website" hint="Any public URL">
            <input
              className="input"
              placeholder="https://yourstartup.co"
              value={form.website_url}
              onChange={set("website_url")}
              type="url"
            />
          </Field>
        </div>

        <Field label="Resume or CV" hint="PDF only, max 10MB">
          <div
            className="border border-dashed border-[#27272a] hover:border-[#3f3f46] rounded-xl p-6 text-center cursor-pointer transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) =>
                setForm((f) => ({ ...f, resume: e.target.files?.[0] ?? null }))
              }
            />
            {form.resume ? (
              <div className="flex items-center justify-center gap-2 text-sm">
                <span className="text-[#4ade80]">✓</span>
                <span className="text-white font-medium">{form.resume.name}</span>
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setForm((f) => ({ ...f, resume: null }));
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="text-[#71717a] hover:text-white ml-1 text-xs"
                >
                  remove
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-[#a1a1aa]">
                  <span className="text-white">Click to upload</span> your resume
                </p>
                <p className="text-xs text-[#52525b]">PDF · Max 10MB</p>
              </div>
            )}
          </div>
        </Field>
      </section>

      {status === "error" && (
        <p className="text-sm text-[#f87171] border border-[#7f1d1d] bg-[#450a0a] rounded-lg px-4 py-3">
          {errorMsg}
        </p>
      )}

      <Button type="submit" fullWidth disabled={status === "loading"} className="py-3">
        {status === "loading" ? "Activating your agent…" : "Activate my agent →"}
      </Button>

      <p className="text-center text-xs text-[#52525b]">
        Your agent runs every 2 hours. You&apos;ll only be contacted when there&apos;s a
        high-confidence match.
      </p>
    </form>
  );
}

function SectionLabel({
  number,
  title,
  subtitle,
}: {
  number: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="font-mono text-xs text-[#52525b] mt-0.5 tabular-nums">{number}</span>
      <div>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {subtitle && <p className="text-xs text-[#71717a] mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm text-[#a1a1aa]">
        {label}
        {required && <span className="text-[#52525b] ml-0.5">*</span>}
        {hint && <span className="text-[#52525b] ml-1.5 text-xs">· {hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Divider() {
  return <hr className="border-[#18181b]" />;
}
