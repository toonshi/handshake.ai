import { getDb } from './supabase';

async function check() {
  const sql = getDb();
  try {
    const users = await sql`SELECT id, name, role, description, telegram_username FROM users ORDER BY name`;
    console.log(`SUCCESS: Fetched ${users.length} users:`);
    console.log(JSON.stringify(users, null, 2));
  } catch (err) {
    console.error('ERROR FETCHING USERS:', err);
  } finally {
    process.exit(0);
  }
}

check();
