export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { runMatchingCycle } from '@/lib/matching';

function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runMatchingCycle();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    console.error('[match] Error:', err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// Vercel Cron uses GET by default
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runMatchingCycle();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    console.error('[match] Error:', err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
