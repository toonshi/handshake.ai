import { NextRequest, NextResponse } from "next/server";
import { getEvents, createEvent, getOrganizerByToken } from "@/lib/db";

function getToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

export async function GET(req: NextRequest) {
  try {
    const token = getToken(req);
    let organizerId: string | undefined;
    if (token) {
      const organizer = await getOrganizerByToken(token);
      if (organizer) organizerId = organizer.id;
    }
    const events = await getEvents(organizerId);
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

    const token = getToken(req);
    let organizerId: string | undefined;
    if (token) {
      const organizer = await getOrganizerByToken(token);
      if (organizer) organizerId = organizer.id;
    }

    const event = await createEvent(code, name, organizerName, organizerId);
    return NextResponse.json({ success: true, event });
  } catch (err: any) {
    const msg = err.message || "Internal error";
    if (err.code === '23505') {
      return NextResponse.json({ error: "An event with this code already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
