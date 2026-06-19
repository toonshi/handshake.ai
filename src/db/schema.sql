-- Enable pgvector extension (run once as superuser)
create extension if not exists vector;

-- Users table
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique not null,
  telegram_username text,
  phone_number text,
  accept_all_matches boolean not null default false,
  name text not null,
  role text not null,
  description text not null,
  goals text not null,
  challenges text not null,
  offers text not null,
  enrichments jsonb not null default '{"websites":[]}',
  goal_embedding vector(1536),
  challenge_embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Matches table
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references users(id) on delete cascade,
  user_b_id uuid not null references users(id) on delete cascade,
  similarity_score float not null default 0,
  agent_a_score float not null default 0,
  agent_b_score float not null default 0,
  transcript jsonb not null default '[]',
  rationale text not null default '',
  conversation_starter text not null default '',
  collaboration_opportunities jsonb not null default '[]',
  shared_tech_stack jsonb not null default '[]',
  status text not null default 'negotiating',
  user_a_consent boolean not null default false,
  user_b_consent boolean not null default false,
  user_a_feedback int,
  user_b_feedback int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Prevent duplicate pairs
  unique(user_a_id, user_b_id)
);

-- HNSW index — no minimum row count required, better for small datasets
create index if not exists users_goal_embedding_idx
  on users using hnsw (goal_embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create index if not exists users_challenge_embedding_idx
  on users using hnsw (challenge_embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Index for match lookups
create index if not exists matches_user_a_idx on matches(user_a_id);
create index if not exists matches_user_b_idx on matches(user_b_id);
create index if not exists matches_status_idx on matches(status);

-- Updated_at trigger
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_updated_at
  before update on users
  for each row execute function update_updated_at();

create trigger matches_updated_at
  before update on matches
  for each row execute function update_updated_at();

-- pgvector similarity search: match User A's goal embedding against other users' challenge embeddings
create or replace function match_profiles(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  exclude_user_id uuid
)
returns table (
  user_id uuid,
  similarity float
)
language sql stable
as $$
  select
    id as user_id,
    1 - (challenge_embedding <=> query_embedding) as similarity
  from users
  where id != exclude_user_id
    and challenge_embedding is not null
    and 1 - (challenge_embedding <=> query_embedding) > match_threshold
  order by challenge_embedding <=> query_embedding
  limit match_count;
$$;
