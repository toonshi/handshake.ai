import postgres from 'postgres';
import { User, Match, ProfileEnrichments, Event, EventPrompt, UserEventResponse } from './types';

const sql = postgres(process.env.DATABASE_URL!, { ssl: false, max: 10 });

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getUserByTelegramId(telegramId: number): Promise<User | null> {
  const rows = await sql<User[]>`SELECT * FROM users WHERE telegram_id = ${telegramId} LIMIT 1`;
  return rows[0] ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const rows = await sql<User[]>`SELECT * FROM users WHERE id = ${id} LIMIT 1`;
  return rows[0] ?? null;
}

export async function upsertUser(
  data: Omit<User, 'id' | 'created_at' | 'updated_at'>
): Promise<User> {
  const rows = await sql<User[]>`
    INSERT INTO users (
      telegram_id, telegram_username, phone_number, wallet_address, accept_all_matches,
      name, role, description, goals, challenges, offers, enrichments,
      goal_embedding, challenge_embedding
    ) VALUES (
      ${data.telegram_id}, ${data.telegram_username ?? null}, ${data.phone_number ?? null},
      ${data.wallet_address ?? null}, ${data.accept_all_matches ?? false},
      ${data.name}, ${data.role}, ${data.description}, ${data.goals},
      ${data.challenges}, ${data.offers},
      ${sql.json((data.enrichments ?? { websites: [] }) as unknown as postgres.JSONValue)},
      ${data.goal_embedding ? sql`${JSON.stringify(data.goal_embedding)}::vector` : null},
      ${data.challenge_embedding ? sql`${JSON.stringify(data.challenge_embedding)}::vector` : null}
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
      goal_embedding     = EXCLUDED.goal_embedding,
      challenge_embedding= EXCLUDED.challenge_embedding,
      updated_at         = now()
    RETURNING *
  `;
  return rows[0];
}

export async function updateUserEnrichments(
  userId: string,
  enrichments: ProfileEnrichments
): Promise<void> {
  await sql`UPDATE users SET enrichments = ${sql.json(enrichments as unknown as postgres.JSONValue)}, updated_at = now() WHERE id = ${userId}`;
}

export async function updateUserEmbeddings(
  userId: string,
  goalEmbedding: number[],
  challengeEmbedding: number[]
): Promise<void> {
  await sql`
    UPDATE users SET
      goal_embedding      = ${JSON.stringify(goalEmbedding)}::vector,
      challenge_embedding = ${JSON.stringify(challengeEmbedding)}::vector,
      updated_at          = now()
    WHERE id = ${userId}
  `;
}

export async function setUserAcceptAll(userId: string): Promise<void> {
  await sql`UPDATE users SET accept_all_matches = true, updated_at = now() WHERE id = ${userId}`;
}

export async function getAllUsersWithEmbeddings(): Promise<User[]> {
  return sql<User[]>`
    SELECT * FROM users
    WHERE goal_embedding IS NOT NULL AND challenge_embedding IS NOT NULL
  `;
}

export async function findCandidates(
  queryEmbedding: number[],
  excludeUserId: string,
  threshold: number,
  count: number
): Promise<Array<{ user_id: string; similarity: number }>> {
  const embStr = JSON.stringify(queryEmbedding);
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

export async function pairAlreadyProcessed(
  userAId: string,
  userBId: string
): Promise<boolean> {
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
  const rows = await sql<Match[]>`
    INSERT INTO matches (
      user_a_id, user_b_id, similarity_score, agent_a_score, agent_b_score,
      transcript, rationale, conversation_starter,
      collaboration_opportunities, shared_tech_stack,
      status, user_a_consent, user_b_consent
    ) VALUES (
      ${data.user_a_id}, ${data.user_b_id},
      ${data.similarity_score}, ${data.agent_a_score}, ${data.agent_b_score},
      ${sql.json((data.transcript ?? []) as unknown as postgres.JSONValue)},
      ${data.rationale}, ${data.conversation_starter},
      ${sql.json((data.collaboration_opportunities ?? []) as unknown as postgres.JSONValue)},
      ${sql.json((data.shared_tech_stack ?? []) as unknown as postgres.JSONValue)},
      ${data.status}, ${data.user_a_consent}, ${data.user_b_consent}
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
  return rows[0];
}

export async function updateMatch(id: string, data: Partial<Match>): Promise<void> {
  const allowed = [
    'status', 'user_a_consent', 'user_b_consent',
    'user_a_feedback', 'user_b_feedback', 'tx_hash',
    'rationale', 'conversation_starter',
    'collaboration_opportunities', 'shared_tech_stack', 'transcript',
    'agent_a_score', 'agent_b_score',
  ] as const;

  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  for (const key of allowed) {
    if (key in data) {
      const v = (data as Record<string, unknown>)[key];
      if (key === 'transcript' || key === 'collaboration_opportunities' || key === 'shared_tech_stack') {
        updates.push(`${key} = $${i}::jsonb`);
        values.push(JSON.stringify(v));
      } else {
        updates.push(`${key} = $${i}`);
        values.push(v);
      }
      i++;
    }
  }

  if (updates.length === 0) return;
  updates.push(`updated_at = now()`);
  values.push(id);

  await sql.unsafe(
    `UPDATE matches SET ${updates.join(', ')} WHERE id = $${i}`,
    values as string[]
  );
}

export async function getMatchById(id: string): Promise<Match | null> {
  const rows = await sql<Match[]>`SELECT * FROM matches WHERE id = ${id} LIMIT 1`;
  return rows[0] ?? null;
}

// ─── Onboarding sessions ──────────────────────────────────────────────────────

export interface OnboardingSessionRow {
  telegram_id: number;
  session: {
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
  };
}

export async function getOnboardingSession(
  telegramId: number
): Promise<OnboardingSessionRow['session'] | null> {
  const rows = await sql<Array<{ session: OnboardingSessionRow['session'] }>>`
    SELECT session FROM onboarding_sessions WHERE telegram_id = ${telegramId} LIMIT 1
  `;
  return rows[0]?.session ?? null;
}

export async function saveOnboardingSession(
  telegramId: number,
  session: OnboardingSessionRow['session']
): Promise<void> {
  await sql`
    INSERT INTO onboarding_sessions (telegram_id, session)
    VALUES (${telegramId}, ${sql.json(session)})
    ON CONFLICT (telegram_id) DO UPDATE SET session = EXCLUDED.session, updated_at = now()
  `;
}

export async function deleteOnboardingSession(telegramId: number): Promise<void> {
  await sql`DELETE FROM onboarding_sessions WHERE telegram_id = ${telegramId}`;
}

// ─── Organizer Events & Prompts ─────────────────────────────────────────────

export async function getEvents(): Promise<Event[]> {
  return sql<Event[]>`SELECT * FROM events ORDER BY created_at DESC`;
}

export async function getEventByCode(code: string): Promise<Event | null> {
  const rows = await sql<Event[]>`SELECT * FROM events WHERE UPPER(code) = ${code.toUpperCase()} LIMIT 1`;
  return rows[0] ?? null;
}

export async function getEventPrompts(eventId: string): Promise<EventPrompt[]> {
  return sql<EventPrompt[]>`SELECT * FROM event_prompts WHERE event_id = ${eventId} ORDER BY order_index ASC`;
}

export async function createEvent(code: string, name: string, organizerName: string): Promise<Event> {
  const rows = await sql<Event[]>`
    INSERT INTO events (code, name, organizer_name)
    VALUES (${code.toUpperCase()}, ${name}, ${organizerName})
    RETURNING *
  `;
  return rows[0];
}

export async function updateEventPrompts(eventId: string, prompts: string[]): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`DELETE FROM event_prompts WHERE event_id = ${eventId}`;
    if (prompts.length > 0) {
      const rows = prompts.map((promptText, index) => ({
        event_id: eventId,
        prompt_text: promptText,
        order_index: index,
      }));
      await tx`INSERT INTO event_prompts ${tx(rows, 'event_id', 'prompt_text', 'order_index')}`;
    }
  });
}

export async function getUserEventResponses(eventId: string): Promise<UserEventResponse[]> {
  return sql<UserEventResponse[]>`
    SELECT 
      uer.id,
      uer.user_id,
      uer.event_id,
      uer.responses,
      uer.created_at,
      u.name as user_name,
      u.telegram_username as user_username
    FROM user_event_responses uer
    JOIN users u ON uer.user_id = u.id
    WHERE uer.event_id = ${eventId}
    ORDER BY uer.created_at DESC
  `;
}

export async function updateEventInsights(eventId: string, insights: string): Promise<void> {
  await sql`UPDATE events SET ai_insights = ${insights} WHERE id = ${eventId}`;
}


