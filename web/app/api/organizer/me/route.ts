import { NextRequest, NextResponse } from "next/server";
import { getOrganizerByToken } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const organizer = await getOrganizerByToken(token);
    if (!organizer) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    return NextResponse.json({ organizer });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
