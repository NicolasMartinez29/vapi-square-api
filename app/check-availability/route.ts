import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { businesses } from '@/lib/schema';
import { searchAvailableSlots } from '@/lib/square';
import {
  buildServiceMap,
  dayBoundsUtc,
  formatSlotInTz,
  normalizeDate,
  normalizeServiceKey,
} from '@/lib/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  service: z.string().min(1),
  date: z.string().min(4),
  business: z.string().optional(),
});

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid JSON body' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'invalid payload', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const all = await db.select().from(businesses);
  const business = input.business ? all.find((b) => b.slug === input.business) : all[0];
  if (!business) {
    return NextResponse.json({ success: false, error: 'no business configured' }, { status: 500 });
  }

  const serviceMap = buildServiceMap(business.serviceMap);
  const serviceKey = normalizeServiceKey(input.service);
  const serviceVariationId = serviceMap[serviceKey];
  if (!serviceVariationId) {
    return NextResponse.json(
      {
        success: false,
        error: `Unknown service "${input.service}". Known: ${Object.keys(serviceMap).join(', ') || '(none)'}`,
      },
      { status: 400 }
    );
  }

  let isoDate: string;
  try {
    isoDate = normalizeDate(input.date);
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
  const { startUtcIso, endUtcIso } = dayBoundsUtc(isoDate, business.timezone);
  try {
    const slotsUtc = await searchAvailableSlots(business, serviceVariationId, startUtcIso, endUtcIso);
    const slots = slotsUtc.map((iso) => ({
      utc: iso,
      time: formatSlotInTz(iso, business.timezone),
    }));
    return NextResponse.json({
      success: true,
      date: isoDate,
      service: input.service,
      timezone: business.timezone,
      slotCount: slots.length,
      slots,
    });
  } catch (err) {
    const e = err as { errors?: unknown; message?: string };
    return NextResponse.json(
      { success: false, error: 'Square availability lookup failed', details: e.errors ?? e.message ?? String(err) },
      { status: 502 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: 'POST /check-availability',
    body: { service: 'string', date: 'YYYY-MM-DD', business: 'optional slug' },
    returns: 'array of available HH:MM slots in business timezone',
  });
}
