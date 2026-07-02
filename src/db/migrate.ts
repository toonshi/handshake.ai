import { getDb } from './supabase';

async function migrate() {
  const sql = getDb();
  console.log('🔄 Running database migrations...');

  try {
    // 1. Create events table
    await sql`
      CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        organizer_name TEXT NOT NULL,
        organizer_id UUID,
        ai_insights TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    console.log('✅ Created events table');

    // 1b. Add missing columns to events if table already existed
    await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_id UUID`;
    await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS ai_insights TEXT`;

    // 2. Create organizers table
    await sql`
      CREATE TABLE IF NOT EXISTS organizers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        session_token TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    console.log('✅ Created organizers table');

    // 3. Create event_prompts table
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

    // 4. Create user_event_responses table
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
