import { NextResponse } from "next/server";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { ssl: false, max: 5 });

export async function GET() {
  try {
    const users = await sql`
      SELECT id, name, role, description, telegram_username
      FROM users
      ORDER BY name
    `;
    return NextResponse.json({ users });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
