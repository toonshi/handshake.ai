import { NextRequest, NextResponse } from "next/server";
import { loginOrganizer, claimEventsForOrganizer } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }
    const result = await loginOrganizer(email, password);
    if (!result) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    // Auto-claim any existing events matching the organizer's name
    await claimEventsForOrganizer(result.organizer.name, result.organizer.id);
    return NextResponse.json({ success: true, organizer: result.organizer, token: result.token });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[login organizer]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
