-- Add the profile enrichments column expected by the frontend registration flow.
-- Run this once in the Supabase SQL editor.

alter table if exists public.users
  add column if not exists enrichments jsonb not null default '{"websites":[]}'::jsonb;

update public.users
  set enrichments = '{"websites":[]}'::jsonb
  where enrichments is null;
