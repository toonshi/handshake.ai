import { getDb } from './supabase';

async function migrate() {
  const sql = getDb();
  console.log('🔄 Running database migrations for Organizer Prompts feature...');

  try {
    // 1. Create events table
    await sql`
      CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        organizer_name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    console.log('✅ Created events table');

    // 2. Create event_prompts table
    await sql`
      CREATE TABLE IF NOT EXISTS event_prompts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        prompt_text TEXT NOT NULL,
        order_index INT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    console.log('✅ Created event_prompts table');

    // 3. Create user_event_responses table
    await sql`
      CREATE TABLE IF NOT EXISTS user_event_responses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        responses JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(user_id, event_id)
      )
    `;
    console.log('✅ Created user_event_responses table');

    console.log('🚀 Migrations completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

migrate();
