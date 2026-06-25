import { NextRequest, NextResponse } from "next/server";
import { getEvents, createEvent } from "@/lib/db";

export async function GET() {
  try {
    const events = await getEvents();
    return NextResponse.json({ events });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { code, name, organizerName } = await req.json();
    if (!code || !name || !organizerName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const event = await createEvent(code, name, organizerName);
    return NextResponse.json({ success: true, event });
  } catch (err: any) {
    const msg = err.message || "Internal error";
    // Check for unique key constraint (Postgres code 23505)
    if (err.code === '23505') {
      return NextResponse.json({ error: "An event with this code already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
