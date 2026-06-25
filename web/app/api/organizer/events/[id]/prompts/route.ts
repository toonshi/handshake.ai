import { NextRequest, NextResponse } from "next/server";
import { getEventPrompts, updateEventPrompts } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const prompts = await getEventPrompts(id);
    return NextResponse.json({ prompts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { prompts } = await req.json();
    if (!Array.isArray(prompts)) {
      return NextResponse.json({ error: "Prompts must be an array of strings" }, { status: 400 });
    }
    await updateEventPrompts(id, prompts);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
