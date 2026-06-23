import * as fs from 'fs';
import * as path from 'path';

// Load .env manually (no dotenv dependency)
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  telegram: {
    token: required('TELEGRAM_BOT_TOKEN'),
    /** Local dev: long-polling. Production (Vercel): webhook via /api/bot */
    usePolling: optional('TELEGRAM_USE_POLLING', 'true') === 'true',
  },
  gemini: {
    apiKey: optional('GEMINI_API_KEY', ''),
    textModel: optional('GEMINI_TEXT_MODEL', 'gemini-2.5-flash'),
    embeddingModel: optional('GEMINI_EMBEDDING_MODEL', 'gemini-embedding-2'),
    embeddingDimensions: parseInt(optional('GEMINI_EMBEDDING_DIMENSIONS', '1536'), 10),
  },
  db: {
    url: optional('DATABASE_URL', 'postgresql://handshake:handshake_db_pass_2024@104.248.134.75:5432/handshake'),
  },
  openrouter: {
    apiKey: optional('OPENROUTER_API_KEY', ''),
    model: optional('OPENROUTER_MODEL', 'openai/gpt-4o'),
    embeddingModel: optional('OPENROUTER_EMBEDDING_MODEL', 'openai/text-embedding-3-small'),
  },
  elevenlabs: {
    apiKey: optional('ELEVENLABS_API_KEY', ''),
    agentId: optional('ELEVENLABS_AGENT_ID', ''),
    agentTemplateId: optional('ELEVENLABS_AGENT_TEMPLATE_ID', ''),
  },
  matching: {
    scoreThreshold: parseFloat(optional('MATCH_SCORE_THRESHOLD', '0.72')),
    cronSchedule: optional('MATCH_CRON_SCHEDULE', '0 */2 * * *'),
    similarityThreshold: parseFloat(optional('SIMILARITY_THRESHOLD', '0.65')),
    candidateCount: parseInt(optional('SIMILARITY_CANDIDATE_COUNT', '5'), 10),
  },
};
