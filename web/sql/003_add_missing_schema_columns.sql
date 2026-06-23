-- Run this in Supabase SQL editor: https://app.supabase.com/project/tmcsffludppvngdzmmlj/sql

-- Users table: missing columns added after initial schema creation
alter table users
  add column if not exists accept_all_matches boolean not null default false,
  add column if not exists enrichments jsonb not null default '{"websites":[]}';

-- Matches table: missing columns added after initial schema creation
alter table matches
  add column if not exists collaboration_opportunities jsonb not null default '[]',
  add column if not exists shared_tech_stack jsonb not null default '[]',
  add column if not exists tx_hash text;

-- Once this is run, PostgREST will pick up the new columns automatically.
-- The application code has a workaround (storing these in `transcript` jsonb)
-- that can be removed once this migration is applied.
