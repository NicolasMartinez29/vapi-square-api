import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { businesses } from '@/lib/schema';

export const runtime = 'nodejs';

export async function GET() {
  let dbOk = false;
  let businessCount = 0;
  try {
    const rows = await db.select({ id: businesses.id }).from(businesses);
    dbOk = true;
    businessCount = rows.length;
  } catch (err) {
    console.error('[health] db check failed:', err);
  }
  return NextResponse.json({
    ok: dbOk,
    db: dbOk ? 'connected' : 'unreachable',
    businesses: businessCount,
    twilio: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER),
  });
}
