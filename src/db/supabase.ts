import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import { User, Match, ProfileEnrichments } from '../types';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Omit<User, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<User, 'id' | 'created_at'>>;
      };
      matches: {
        Row: Match;
        Insert: Omit<Match, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Match, 'id' | 'created_at'>>;
      };
    };
  };
}

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(config.supabase.url, config.supabase.serviceKey, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

export async function upsertUser(
  data: Omit<User, 'id' | 'created_at' | 'updated_at'>
): Promise<User> {
  const db = getSupabase();
  const { data: user, error } = await db
    .from('users')
    .upsert(data, { onConflict: 'telegram_id' })
    .select()
    .single();
  if (error) throw new Error(`Failed to upsert user: ${error.message}`);
  return user as User;
}

export async function getUserByTelegramId(telegramId: number): Promise<User | null> {
  const db = getSupabase();
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

export async function getAllUsersWithEmbeddings(): Promise<User[]> {
  const db = getSupabase();
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
  const db = getSupabase();
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
  const db = getSupabase();
  // Check both orderings
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
  const db = getSupabase();
  const { data: match, error } = await db
    .from('matches')
    .insert(data)
    .select()
    .single();
  if (error) throw new Error(`Failed to create match: ${error.message}`);
  return match as Match;
}

export async function updateMatch(id: string, data: Partial<Match>): Promise<void> {
  const db = getSupabase();
  const { error } = await db.from('matches').update(data).eq('id', id);
  if (error) throw new Error(`Failed to update match: ${error.message}`);
}

export async function getMatchById(id: string): Promise<Match | null> {
  const db = getSupabase();
  const { data, error } = await db.from('matches').select('*').eq('id', id).single();
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get match: ${error.message}`);
  }
  return data as Match | null;
}

export async function getUserById(id: string): Promise<User | null> {
  const db = getSupabase();
  const { data, error } = await db.from('users').select('*').eq('id', id).single();
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get user: ${error.message}`);
  }
  return data as User | null;
}

export async function updateUserEnrichments(
  userId: string,
  enrichments: ProfileEnrichments
): Promise<void> {
  const db = getSupabase();
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
  const db = getSupabase();
  const { error } = await db
    .from('users')
    .update({ goal_embedding: goalEmbedding, challenge_embedding: challengeEmbedding })
    .eq('id', userId);
  if (error) throw new Error(`Failed to update embeddings: ${error.message}`);
}

export async function setUserAcceptAll(userId: string): Promise<void> {
  const db = getSupabase();
  const { error } = await db
    .from('users')
    .update({ accept_all_matches: true })
    .eq('id', userId);
  if (error) throw new Error(`Failed to set accept_all: ${error.message}`);
}
