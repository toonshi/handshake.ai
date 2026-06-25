-- Add Avalanche transaction hash column to matches
ALTER TABLE matches ADD COLUMN IF NOT EXISTS tx_hash text;
