import { NextRequest, NextResponse } from "next/server";
import { getMatchById, updateMatch } from "@/lib/db";
import { initiateCallsForMatch } from "@/lib/bot/notifications";

export async function POST(req: NextRequest) {
  try {
    const { matchId } = await req.json() as { matchId: string };

    const match = await getMatchById(matchId);
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    await updateMatch(matchId, {
      user_a_consent: true,
      user_b_consent: true,
      status: "calling",
    });

    const updatedMatch = await getMatchById(matchId);
    if (updatedMatch) {
      await initiateCallsForMatch(updatedMatch);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[consent]", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
