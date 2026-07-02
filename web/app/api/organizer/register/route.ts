import { NextRequest, NextResponse } from "next/server";
import { createOrganizer } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json();
    if (!name || !email || !password) {
      return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }
    const organizer = await createOrganizer(name, email, password);
    return NextResponse.json({ success: true, organizer });
  } catch (err: any) {
    if (err.code === '23505') {
      return NextResponse.json({ error: "An organizer with this email already exists" }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[register organizer]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
