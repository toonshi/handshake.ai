# Handshake AI — Agent Context

## Project Overview

AI-powered matchmaking for events. Attendees get introduced to 3-5 people they should meet based on goals, skills, and what they're building. Originally built for MiniHack Kenya.

## Architecture — Two Apps

### 1. Bot (`src/`) — Node.js Telegram bot
- Runs via `npm run dev` (ts-node-dev --respawn --transpile-only src/index.ts)
- Uses `node-telegram-bot-api` with long-polling
- Entry: `src/index.ts` → `src/bot/index.ts` (createBot)
- Handles: `/start`, `/github`, `/website`, `/setphone`, `/join`, `/rematch`, `/status`, `/help`
- Has its own notification system: `src/bot/notifications.ts`
- Matching scheduler: `src/bot/scheduler.ts`
- Shares DB with web app (Supabase/Postgres via `postgres` library)

### 2. Web (`web/`) — Next.js frontend
- Runs via `npm run dev` in `web/` dir
- Next.js 16 (not the standard Next.js — read `web/node_modules/next/dist/docs/` before coding)
- Pages: `/` (registration form), `/live` (demo), `/organizer` (auth-gated panel)
- API routes in `web/app/api/`
- Notification/Telegram lib: `web/lib/telegram.ts`, `web/lib/bot/notifications.ts`

## Database (shared Postgres via `postgres` library)
- `users` — registered attendees (telegram_id can be negative placeholder for web-only users)
- `matches` — AI-generated matches with scores, rationale, status
- `events` — organizer-created events (has organizer_id FK, ai_insights)
- `event_prompts` — custom questions for events
- `user_event_responses` — answers to event prompts
- `organizers` — auth table (email + password_hash + session_token)
- Migration: `src/db/migrate.ts`

## Recent Work (last session)

### Bugs Fixed
1. **409 Conflict on bot start** — Added `stopPolling()` before `deleteWebHook()` + 3x retry with 2s backoff on `startPolling()` (`src/bot/index.ts:60-91`)
2. **"chat not found" for web users** — Added `telegram_id < 0` guard in all notification functions in both `web/lib/bot/notifications.ts` and `src/bot/notifications.ts`. Web users get a negative placeholder telegram_id until they message the bot.

### Features Built
3. **Organizer auth system**:
   - `organizers` table (email + bcrypt-style password hash via `crypto.scryptSync`)
   - API routes: `/api/organizer/register`, `/api/organizer/login`, `/api/organizer/me`
   - Session tokens (random hex, stored in DB)
4. **Auth-gated /organizer page**:
   - Login/Register tab toggle (`web/components/organizer-auth.tsx`)
   - Dashboard only shows events belonging to logged-in organizer
   - Auto-claims existing events matching organizer name on login
   - Create event form uses logged-in organizer's name
5. **Migration updated** (`src/db/migrate.ts`) — adds organizers table, organizer_id + ai_insights columns to events

### Docs Created
6. `pitch.md` — Marketing guide for Kenyan schools, KES pricing, objection handling
7. `progress.md` — Full project tracker (this file is the condensed version)

## Pending Decisions

### Naming
- Considering rename from "Handshake" / "handshake.ai"
- Frontrunner: **Synaptic Pulse**
- Other candidates: Circuit Link, Neural Knot, Synaptic Link
- Waiting for user to discuss with partner before committing

### Next Steps (from progress.md)
- [ ] Rename project if name changes (repo, code, branding)
- [ ] Build `/pitch` landing page for organizer sales
- [ ] M-Pesa payment integration (Daraja API)
- [ ] Event sponsorship model
- [ ] Revenue models to explore: per-event (schools), per-user premium, sponsored intros, on-chain fees, HR SaaS

## Pricing (KES) — Kenyan Schools Market

| Tier | Scope | Price |
|---|---|---|
| Pilot | Single event | KES 25,000-35,000 |
| Annual | All graduation events | KES 300,000 |
| Campus license | Unlimited events | KES 600,000 |

Alternative: Sponsor model (brand pays KES 150K-300K, school free).

## Key Technical Notes

- `telegram_id < 0` = web-registered user who hasn't messaged the bot yet
- The bot uses `ts-node-dev --transpile-only` — type errors from esModuleInterop/tough-cookie are pre-existing and non-blocking
- Two separate notification systems exist (web + bot) — both need `telegram_id` guard
- Next.js 16 has breaking changes — check docs before coding
- DB uses `postgres` library (tagged template SQL), not an ORM
