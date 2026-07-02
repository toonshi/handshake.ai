# Handshake → Synaptic Pulse (?)

## Name Ideas

### Contenders
- Synaptic Link
- Synaptic Pulse **(frontrunner)**
- Neural Knot
- Neural Bridge
- Circuit Link
- Circuit Pulse
- Circuit Grid
- Pulse Connect
- Node Spark
- Smart Circuit
- Relay Net

### Decision
Waiting for user to discuss with partner.

---

## Feature Progress

### Done
- [x] Fix 409 Conflict on bot startup — added `stopPolling()` before `deleteWebHook()` + 3x retry with 2s backoff on `startPolling()` (`src/bot/index.ts`)
- [x] Fix "chat not found" for web-registered users — added `telegram_id < 0` guard in all notification functions (`web/lib/bot/notifications.ts`, `src/bot/notifications.ts`)
- [x] Organizer registration & auth system (`organizers` table, register/login/me APIs, password hashing with `crypto.scryptSync`)
- [x] Auth-gated `/organizer` page — login/register forms, events scoped to logged-in organizer
- [x] Auto-claim existing events on organizer login (matches by `organizer_name`)
- [x] Migration script updated (`src/db/migrate.ts`) — adds `organizers` table, `organizer_id` and `ai_insights` columns to `events`
- [x] Pitch guide created (`pitch.md`) — Kenyan schools market, KES pricing, objection handling, escalation plan

### TODO
- [ ] Rename project if name changes (repo, code, branding)
- [ ] Build `/pitch` landing page for organizer sales
- [ ] M-Pesa payment integration (Daraja API)
- [ ] Event sponsorship model (brand pays, school gets it free)

---

## Pricing (KES) — Kenyan Schools

| Tier | Scope | Price |
|---|---|---|
| Pilot / single event | One graduation dinner, any size | KES 25,000-35,000 |
| Annual | All graduation events for the year | KES 300,000 |
| Campus license | Unlimited events, career fairs, hackathons | KES 600,000 |

### Alternative Models
- **Sponsor**: Brand pays KES 150K-300K, school gets it free
- **Student council**: KES 15K-25K from event budget
- **Department pilot**: KES 15K-20K from a single department

---

## Revenue Models

1. **Per-event** — sell to event organizers (schools, conferences, hackathons). Flat fee, predictable.
2. **Per-user premium** — free basic matching, paid unlocks enrichment calls, priority matching, network reports.
3. **Sponsored introductions** — brands pay to sponsor certain profiles/industries.
4. **On-chain recording fee** — charge micro-transaction for blockchain connection record.
5. **HR SaaS** — sell to companies for internal employee networking.

---

## Pitch Script (Walking into HOD's Office)

> "Hey [HOD/Council Chair], I built a networking bot for our graduation dinner. Every student gets matched with 3-5 people they should actually meet — based on their goals, skills, and what they're building. I want to run it for our graduation. It costs KES 30,000 to cover infrastructure. That's KES 60 per student if we have 500 people. I'll handle everything — just give me 10 minutes in the program."

### Objection Handling

| Objection | Response |
|---|---|
| "Why pay?" | "Your alumni network is your biggest asset. Most graduates leave knowing 5 people. This doubles that." |
| "Students won't use it." | "5-minute phone form. Already proven at MiniHack Kenya." |
| "KES 30K too much." | "KES 60/head. Compare to a photo booth or guest speaker." |
| "We already do icebreakers." | "Icebreakers are random. This is intentional — AI finds the right connections." |
