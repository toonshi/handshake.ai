import { getDb } from './supabase';

async function migrate() {
  const sql = getDb();
  console.log('🔄 Running database migrations to add ai_insights to events...');

  try {
    await sql`
      ALTER TABLE events 
      ADD COLUMN IF NOT EXISTS ai_insights TEXT
    `;
    console.log('✅ Added ai_insights column to events table');
    console.log('🚀 Migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

migrate();
