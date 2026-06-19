// Run this in Supabase SQL editor to add the onboarding_sessions table:
// create table if not exists onboarding_sessions (
//   telegram_id bigint primary key,
//   session jsonb not null default '{}',
//   updated_at timestamptz not null default now()
// );
// create or replace function update_onboarding_updated_at()
// returns trigger language plpgsql as $$
// begin new.updated_at = now(); return new; end; $$;
// create trigger onboarding_sessions_updated_at
//   before update on onboarding_sessions
//   for each row execute function update_onboarding_updated_at();

import { createClient } from '@supabase/supabase-js';
import { User, Match, ProfileEnrichments } from './types';

function getDb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function getUserByTelegramId(telegramId: number): Promise<User | null> {
  const db = getDb();
  const { data, error } = await db
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get user: ${error.message}`);
  }
  return data as User | null;
}

export async function getUserById(id: string): Promise<User | null> {
  const db = getDb();
  const { data, error } = await db.from('users').select('*').eq('id', id).single();
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get user: ${error.message}`);
  }
  return data as User | null;
}

export async function upsertUser(
  data: Omit<User, 'id' | 'created_at' | 'updated_at'>
): Promise<User> {
  const db = getDb();
  const { data: user, error } = await db
    .from('users')
    .upsert(data, { onConflict: 'telegram_id' })
    .select()
    .single();
  if (error) throw new Error(`Failed to upsert user: ${error.message}`);
  return user as User;
}

export async function updateUserEnrichments(
  userId: string,
  enrichments: ProfileEnrichments
): Promise<void> {
  const db = getDb();
  const { error } = await db
    .from('users')
    .update({ enrichments })
    .eq('id', userId);
  if (error) throw new Error(`Failed to update enrichments: ${error.message}`);
}

export async function updateUserEmbeddings(
  userId: string,
  goalEmbedding: number[],
  challengeEmbedding: number[]
): Promise<void> {
  const db = getDb();
  const { error } = await db
    .from('users')
    .update({ goal_embedding: goalEmbedding, challenge_embedding: challengeEmbedding })
    .eq('id', userId);
  if (error) throw new Error(`Failed to update embeddings: ${error.message}`);
}

export async function setUserAcceptAll(userId: string): Promise<void> {
  const db = getDb();
  const { error } = await db
    .from('users')
    .update({ accept_all_matches: true })
    .eq('id', userId);
  if (error) throw new Error(`Failed to set accept_all: ${error.message}`);
}

export async function getAllUsersWithEmbeddings(): Promise<User[]> {
  const db = getDb();
  const { data, error } = await db
    .from('users')
    .select('*')
    .not('goal_embedding', 'is', null)
    .not('challenge_embedding', 'is', null);
  if (error) throw new Error(`Failed to get users: ${error.message}`);
  return (data ?? []) as User[];
}

export async function findCandidates(
  queryEmbedding: number[],
  excludeUserId: string,
  threshold: number,
  count: number
): Promise<Array<{ user_id: string; similarity: number }>> {
  const db = getDb();
  const { data, error } = await db.rpc('match_profiles', {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: count,
    exclude_user_id: excludeUserId,
  });
  if (error) throw new Error(`Failed to find candidates: ${error.message}`);
  return (data ?? []) as Array<{ user_id: string; similarity: number }>;
}

export async function pairAlreadyProcessed(
  userAId: string,
  userBId: string
): Promise<boolean> {
  const db = getDb();
  const { data } = await db
    .from('matches')
    .select('id')
    .or(
      `and(user_a_id.eq.${userAId},user_b_id.eq.${userBId}),and(user_a_id.eq.${userBId},user_b_id.eq.${userAId})`
    )
    .limit(1);
  return (data ?? []).length > 0;
}

export async function createMatch(
  data: Omit<Match, 'id' | 'created_at' | 'updated_at'>
): Promise<Match> {
  const db = getDb();
  const { data: match, error } = await db
    .from('matches')
    .insert(data)
    .select()
    .single();
  if (error) throw new Error(`Failed to create match: ${error.message}`);
  return match as Match;
}

export async function updateMatch(id: string, data: Partial<Match>): Promise<void> {
  const db = getDb();
  const { error } = await db.from('matches').update(data).eq('id', id);
  if (error) throw new Error(`Failed to update match: ${error.message}`);
}

export async function getMatchById(id: string): Promise<Match | null> {
  const db = getDb();
  const { data, error } = await db.from('matches').select('*').eq('id', id).single();
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get match: ${error.message}`);
  }
  return data as Match | null;
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
  const db = getDb();
  const { data, error } = await db
    .from('onboarding_sessions')
    .select('session')
    .eq('telegram_id', telegramId)
    .single();
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get onboarding session: ${error.message}`);
  }
  if (!data) return null;
  return (data as { session: OnboardingSessionRow['session'] }).session;
}

export async function saveOnboardingSession(
  telegramId: number,
  session: OnboardingSessionRow['session']
): Promise<void> {
  const db = getDb();
  const { error } = await db
    .from('onboarding_sessions')
    .upsert({ telegram_id: telegramId, session }, { onConflict: 'telegram_id' });
  if (error) throw new Error(`Failed to save onboarding session: ${error.message}`);
}

export async function deleteOnboardingSession(telegramId: number): Promise<void> {
  const db = getDb();
  const { error } = await db
    .from('onboarding_sessions')
    .delete()
    .eq('telegram_id', telegramId);
  if (error) throw new Error(`Failed to delete onboarding session: ${error.message}`);
}
