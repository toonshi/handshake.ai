import postgres from 'postgres';
import { User, Match, ProfileEnrichments, Event, EventPrompt, UserEventResponse } from '../types';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://handshake:handshake_db_pass_2024@104.248.134.75:5432/handshake';

let _sql: ReturnType<typeof postgres> | null = null;

export function getDb(): ReturnType<typeof postgres> {
  if (!_sql) _sql = postgres(DATABASE_URL, { max: 10 });
  return _sql;
}

// Backwards-compat alias
export const getSupabase = getDb;

export interface Database {
  public: {
    Tables: {
      users: { Row: User; Insert: Omit<User, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<User, 'id' | 'created_at'>>; };
      matches: { Row: Match; Insert: Omit<Match, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Match, 'id' | 'created_at'>>; };
    };
  };
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(
  data: Omit<User, 'id' | 'created_at' | 'updated_at'>
): Promise<User> {
  const sql = getDb();
  const rows = await sql<User[]>`
    INSERT INTO users (
      telegram_id, telegram_username, phone_number, wallet_address, accept_all_matches,
      name, role, description, goals, challenges, offers, enrichments
    ) VALUES (
      ${data.telegram_id}, ${data.telegram_username ?? null}, ${data.phone_number ?? null},
      ${data.wallet_address ?? null}, ${data.accept_all_matches ?? false},
      ${data.name}, ${data.role}, ${data.description},
      ${data.goals}, ${data.challenges}, ${data.offers},
      ${JSON.stringify(data.enrichments ?? { websites: [] })}::jsonb
    )
    ON CONFLICT (telegram_id) DO UPDATE SET
      telegram_username  = EXCLUDED.telegram_username,
      phone_number       = EXCLUDED.phone_number,
      wallet_address     = EXCLUDED.wallet_address,
      accept_all_matches = EXCLUDED.accept_all_matches,
      name               = EXCLUDED.name,
      role               = EXCLUDED.role,
      description        = EXCLUDED.description,
      goals              = EXCLUDED.goals,
      challenges         = EXCLUDED.challenges,
      offers             = EXCLUDED.offers,
      enrichments        = EXCLUDED.enrichments,
      updated_at         = now()
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Failed to upsert user');
  return rows[0];
}

export async function getUserByTelegramId(telegramId: number): Promise<User | null> {
  const sql = getDb();
  const rows = await sql<User[]>`SELECT * FROM users WHERE telegram_id = ${telegramId} LIMIT 1`;
  return rows[0] ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const sql = getDb();
  const rows = await sql<User[]>`SELECT * FROM users WHERE id = ${id} LIMIT 1`;
  return rows[0] ?? null;
}

export async function getAllUsersWithEmbeddings(): Promise<User[]> {
  const sql = getDb();
  return sql<User[]>`
    SELECT * FROM users WHERE goal_embedding IS NOT NULL AND challenge_embedding IS NOT NULL
  `;
}

export async function findCandidates(
  queryEmbedding: number[] | string,
  excludeUserId: string,
  threshold: number,
  count: number
): Promise<Array<{ user_id: string; similarity: number }>> {
  const sql = getDb();
  const embStr = Array.isArray(queryEmbedding) ? JSON.stringify(queryEmbedding) : queryEmbedding;
  return sql<Array<{ user_id: string; similarity: number }>>`
    SELECT id AS user_id,
           1 - (challenge_embedding <=> ${embStr}::vector) AS similarity
    FROM users
    WHERE id != ${excludeUserId}
      AND challenge_embedding IS NOT NULL
      AND 1 - (challenge_embedding <=> ${embStr}::vector) > ${threshold}
    ORDER BY challenge_embedding <=> ${embStr}::vector
    LIMIT ${count}
  `;
}

export async function pairAlreadyProcessed(userAId: string, userBId: string): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    SELECT id FROM matches
    WHERE (user_a_id = ${userAId} AND user_b_id = ${userBId})
       OR (user_a_id = ${userBId} AND user_b_id = ${userAId})
    LIMIT 1
  `;
  return rows.length > 0;
}

// ─── Matches ──────────────────────────────────────────────────────────────────

export async function createMatch(
  data: Omit<Match, 'id' | 'created_at' | 'updated_at'>
): Promise<Match> {
  const sql = getDb();
  const rows = await sql<Match[]>`
    INSERT INTO matches (
      user_a_id, user_b_id, similarity_score, agent_a_score, agent_b_score,
      transcript, rationale, conversation_starter,
      collaboration_opportunities, shared_tech_stack,
      status, user_a_consent, user_b_consent
    ) VALUES (
      ${data.user_a_id}, ${data.user_b_id},
      ${data.similarity_score}, ${data.agent_a_score}, ${data.agent_b_score},
      ${JSON.stringify(data.transcript ?? [])}::jsonb,
      ${data.rationale ?? ''}, ${data.conversation_starter ?? ''},
      ${JSON.stringify(data.collaboration_opportunities ?? [])}::jsonb,
      ${JSON.stringify(data.shared_tech_stack ?? [])}::jsonb,
      ${data.status}, ${data.user_a_consent ?? false}, ${data.user_b_consent ?? false}
    )
    ON CONFLICT (user_a_id, user_b_id) DO UPDATE SET
      similarity_score = EXCLUDED.similarity_score,
      agent_a_score = EXCLUDED.agent_a_score,
      agent_b_score = EXCLUDED.agent_b_score,
      transcript = EXCLUDED.transcript,
      rationale = EXCLUDED.rationale,
      conversation_starter = EXCLUDED.conversation_starter,
      collaboration_opportunities = EXCLUDED.collaboration_opportunities,
      shared_tech_stack = EXCLUDED.shared_tech_stack,
      status = EXCLUDED.status,
      user_a_consent = EXCLUDED.user_a_consent,
      user_b_consent = EXCLUDED.user_b_consent,
      updated_at = now()
    RETURNING *
  `;
  if (!rows[0]) throw new Error('Failed to create match');
  return rows[0];
}

export async function updateMatch(id: string, data: Partial<Match>): Promise<void> {
  const sql = getDb();
  const jsonbKeys = new Set(['transcript', 'collaboration_opportunities', 'shared_tech_stack']);
  const allowed = [
    'status', 'user_a_consent', 'user_b_consent', 'user_a_feedback', 'user_b_feedback',
    'tx_hash', 'rationale', 'conversation_starter',
    'collaboration_opportunities', 'shared_tech_stack', 'transcript',
    'agent_a_score', 'agent_b_score',
  ] as const;

  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  for (const key of allowed) {
    if (!(key in data)) continue;
    const v = (data as Record<string, unknown>)[key];
    if (jsonbKeys.has(key)) {
      updates.push(`${key} = $${i}::jsonb`);
      values.push(JSON.stringify(v));
    } else {
      updates.push(`${key} = $${i}`);
      values.push(v);
    }
    i++;
  }

  if (updates.length === 0) return;
  updates.push('updated_at = now()');
  values.push(id);
  await sql.unsafe(`UPDATE matches SET ${updates.join(', ')} WHERE id = $${i}`, values as string[]);
}

export async function getMatchById(id: string): Promise<Match | null> {
  const sql = getDb();
  const rows = await sql<Match[]>`SELECT * FROM matches WHERE id = ${id} LIMIT 1`;
  return rows[0] ?? null;
}

// ─── User helpers ─────────────────────────────────────────────────────────────

export async function updateUserEnrichments(userId: string, enrichments: ProfileEnrichments): Promise<void> {
  const sql = getDb();
  await sql`UPDATE users SET enrichments = ${JSON.stringify(enrichments)}::jsonb, updated_at = now() WHERE id = ${userId}`;
}

export async function updateUserEmbeddings(
  userId: string,
  goalEmbedding: number[],
  challengeEmbedding: number[]
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE users SET
      goal_embedding      = ${JSON.stringify(goalEmbedding)}::vector,
      challenge_embedding = ${JSON.stringify(challengeEmbedding)}::vector,
      updated_at          = now()
    WHERE id = ${userId}
  `;
}

export async function setUserAcceptAll(userId: string): Promise<void> {
  const sql = getDb();
  await sql`UPDATE users SET accept_all_matches = true, updated_at = now() WHERE id = ${userId}`;
}

// ─── Onboarding sessions ──────────────────────────────────────────────────────

export interface OnboardingSessionRow {
  telegram_id: number;
  session: { history: Array<{ role: 'user' | 'assistant'; content: string }> };
}

export async function getOnboardingSession(
  telegramId: number
): Promise<OnboardingSessionRow['session'] | null> {
  const sql = getDb();
  const rows = await sql<Array<{ session: OnboardingSessionRow['session'] }>>`
    SELECT session FROM onboarding_sessions WHERE telegram_id = ${telegramId} LIMIT 1
  `;
  return rows[0]?.session ?? null;
}

export async function saveOnboardingSession(
  telegramId: number,
  session: OnboardingSessionRow['session']
): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO onboarding_sessions (telegram_id, session)
    VALUES (${telegramId}, ${JSON.stringify(session)}::jsonb)
    ON CONFLICT (telegram_id) DO UPDATE SET session = EXCLUDED.session, updated_at = now()
  `;
}

export async function deleteOnboardingSession(telegramId: number): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM onboarding_sessions WHERE telegram_id = ${telegramId}`;
}

// ─── Organizer Events & Prompts ─────────────────────────────────────────────

export async function getEventByCode(code: string): Promise<Event | null> {
  const sql = getDb();
  const rows = await sql<Event[]>`SELECT * FROM events WHERE UPPER(code) = ${code.toUpperCase()} LIMIT 1`;
  return rows[0] ?? null;
}

export async function getEventPrompts(eventId: string): Promise<EventPrompt[]> {
  const sql = getDb();
  return sql<EventPrompt[]>`SELECT * FROM event_prompts WHERE event_id = ${eventId} ORDER BY order_index ASC`;
}

export async function saveUserEventResponses(
  userId: string,
  eventId: string,
  responses: Array<{ prompt_id: string; prompt_text: string; response_text: string }>
): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO user_event_responses (user_id, event_id, responses)
    VALUES (${userId}, ${eventId}, ${JSON.stringify(responses)}::jsonb)
    ON CONFLICT (user_id, event_id) DO UPDATE SET responses = EXCLUDED.responses, created_at = now()
  `;
}

