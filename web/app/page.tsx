import Link from "next/link";
import RegistrationForm from "@/components/registration-form";
import SiteHeader from "@/components/site-header";

export default function Home() {
  return (
    <>
      <div className="page-bg" />
      <div className="page-content min-h-screen">
        <SiteHeader active="home" />

        <main className="px-4 py-10 sm:py-16">
          <div className="max-w-xl mx-auto space-y-12">

            <header className="space-y-6">
              <div className="inline-flex items-center gap-2 text-xs font-mono text-[#52525b] border border-[var(--border)] rounded-full px-3 py-1.5 bg-[var(--surface)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse inline-block" />
                MiniHack Kenya · Kuzana Connector
              </div>

              <div className="space-y-4">
                <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-[1.15]">
                  Your agent works the room
                  <br />
                  <span className="text-[var(--muted)]">so you don&apos;t have to.</span>
                </h1>
                <p className="text-[var(--muted)] text-base leading-relaxed">
                  We build you an AI agent from your profile. It negotiates introductions
                  with every other agent in the community. When it finds a match,{" "}
                  <span className="text-white">your phone rings.</span>
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { step: "01", label: "Fill in this form", icon: "◎" },
                  { step: "02", label: "Agent negotiates", icon: "⇄" },
                  { step: "03", label: "You get called", icon: "☎" },
                ].map(({ step, label, icon }) => (
                  <div
                    key={step}
                    className="border border-[var(--border)] rounded-xl p-3 bg-[var(--surface)] hover:border-[var(--border-hover)] transition-colors"
                  >
                    <p className="font-mono text-[10px] text-[#52525b] mb-2 flex items-center justify-between">
                      <span>{step}</span>
                      <span className="text-[var(--muted)]">{icon}</span>
                    </p>
                    <p className="text-xs text-[var(--muted)] leading-tight">{label}</p>
                  </div>
                ))}
              </div>

              <Link
                href="/live"
                className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-white border border-[var(--border)] hover:border-[var(--border-hover)] rounded-xl px-4 py-2.5 transition-colors bg-[var(--surface)]"
              >
                <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse" />
                Watch agents negotiate live →
              </Link>
            </header>

            <div className="card p-6 sm:p-8">
              <RegistrationForm />
            </div>

            <section className="space-y-5">
              <div className="card overflow-hidden">
                <div className="card-header">
                  Hackathon submission
                </div>

                <div className="divide-y divide-[var(--surface-2)]">
                  <SubmissionItem
                    q="Which bounty are you building for?"
                    a="Boardy.ai for Kuzana — an AI-powered matchmaking connector for the MiniHack Kenya community."
                  />
                  <SubmissionItem
                    q="In 5 sentences, what is the core problem and why did you choose it?"
                    a="MiniHack Kenya brings together founders, developers, investors, and mentors — but high-value connections happen by accident rather than by design. Nobody at the event has enough context to broker the right introductions, and the people who could make them don't know enough to make them well. We chose this because the opportunity cost of a missed connection at a hackathon is enormous — a co-founder meeting or investor conversation can change the trajectory of a project. Existing solutions like Boardy.ai work at scale; this community is small and high-trust, where every introduction carries real weight and a bad one destroys credibility. We built agent-to-agent negotiation specifically for this context: small community, high stakes, depth over breadth."
                  />
                  <SubmissionItem
                    q="How does Avalanche infrastructure (smart contracts, USDC, embedded wallets, AA) make your solution better than a Web2 approach?"
                    a="Embedded wallets (via Dynamic) let users onboard without ever touching a wallet UI, while creating a portable on-chain identity that carries reputation across every future Kuzana event. Match quality ratings stored on Avalanche are tamper-proof and portable — a user's track record follows them forever, not siloed in one app. USDC on Avalanche enables introduction bounties — a founder stakes $5 on a connection request, paid to the connector when the intro leads to a verified meeting, creating a real market for quality human networks. Account Abstraction makes gas fees invisible (platform-sponsored), removing the last barrier for East African users unfamiliar with crypto. Smart contract escrow adds accountability — both parties sign an on-chain commitment to connect within 48 hours, dramatically improving follow-through beyond what any Web2 nudge achieves."
                  />
                </div>
              </div>
            </section>

            <footer className="text-center text-xs text-[#3f3f46] pb-4">
              Built for MiniHack · Kuzana ecosystem · Kenya
            </footer>
          </div>
        </main>
      </div>
    </>
  );
}

function SubmissionItem({ q, a }: { q: string; a: string }) {
  return (
    <div className="px-5 py-4 space-y-2">
      <p className="text-xs text-[#71717a] font-medium">→ {q}</p>
      <p className="text-sm text-[var(--muted)] leading-relaxed">{a}</p>
    </div>
  );
}
