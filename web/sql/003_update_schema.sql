-- 1. Ensure all expected columns exist on matches table
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS similarity_score float NOT NULL DEFAULT 0;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS agent_a_score float NOT NULL DEFAULT 0;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS agent_b_score float NOT NULL DEFAULT 0;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS transcript jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS rationale text NOT NULL DEFAULT '';
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS conversation_starter text NOT NULL DEFAULT '';
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS collaboration_opportunities jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS shared_tech_stack jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'negotiating';
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS user_a_consent boolean NOT NULL DEFAULT false;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS user_b_consent boolean NOT NULL DEFAULT false;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS user_a_feedback int;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS user_b_feedback int;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS tx_hash text;

-- 2. Ensure all expected columns exist on users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS wallet_address text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS accept_all_matches boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS enrichments jsonb NOT NULL DEFAULT '{"websites":[]}'::jsonb;

-- 3. Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
