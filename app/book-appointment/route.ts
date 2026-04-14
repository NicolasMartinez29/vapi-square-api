import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { businesses, appointments } from '@/lib/schema';
import { squareClient, safeJson, searchAvailableSlots } from '@/lib/square';
import {
  buildServiceMap,
  dayBoundsUtc,
  formatSlotInTz,
  normalizePhone,
  normalizeServiceKey,
  splitName,
  toRFC3339,
} from '@/lib/services';
import { notifyNewBooking } from '@/lib/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(7),
  service: z.string().min(1),
  date: z.string().min(4),
  time: z.string().min(1),
  business: z.string().optional(),
});

export async function POST(req: Request) {
  const reqId = randomUUID().slice(0, 8);
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
  console.log(`[${reqId}] -> POST /book-appointment`, input);

  const allBusinesses = await db.select().from(businesses);
  const business = input.business
    ? allBusinesses.find((b) => b.slug === input.business)
    : allBusinesses[0];

  if (!business) {
    return NextResponse.json(
      { success: false, error: 'no business configured' },
      { status: 500 }
    );
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

  const normalizedPhone = normalizePhone(input.phone);
  const { givenName, familyName } = splitName(input.name);

  let startAt: string;
  try {
    startAt = toRFC3339(input.date, input.time, business.timezone);
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        reason: 'invalid_datetime',
        error: e instanceof Error ? e.message : String(e),
        hint: 'Send date as YYYY-MM-DD or MM/DD/YYYY, time as 24h HH:MM or 12h with am/pm',
      },
      { status: 400 }
    );
  }

  const client = squareClient(business);
  let squareCustomerId: string | undefined;
  let squareBookingId: string | undefined;
  let squareError: string | undefined;

  try {
    const searchResp = await client.customers.search({
      query: { filter: { phoneNumber: { exact: normalizedPhone } } },
    });
    const existing = searchResp.customers?.[0];
    if (existing?.id) {
      squareCustomerId = existing.id;
    } else {
      const createResp = await client.customers.create({
        idempotencyKey: randomUUID(),
        givenName,
        familyName,
        phoneNumber: normalizedPhone,
      });
      squareCustomerId = createResp.customer?.id;
    }
    console.log(`[${reqId}] customer ${squareCustomerId}`);
  } catch (err) {
    const e = err as { errors?: unknown; message?: string };
    squareError = JSON.stringify(e.errors ?? e.message ?? err);
    console.error(`[${reqId}] customer step failed:`, squareError);
  }

  const dryRun = String(business.dryRun).toLowerCase() === 'true';

  if (!dryRun) {
    try {
      const { startUtcIso, endUtcIso } = dayBoundsUtc(input.date, business.timezone);
      const slotsUtc = await searchAvailableSlots(business, serviceVariationId, startUtcIso, endUtcIso);
      const requestedUtcMs = new Date(startAt).getTime();
      const matchTolerance = 60 * 1000;
      const isAvailable = slotsUtc.some(
        (s) => Math.abs(new Date(s).getTime() - requestedUtcMs) <= matchTolerance
      );
      if (!isAvailable) {
        const alternatives = slotsUtc
          .slice(0, 6)
          .map((iso) => formatSlotInTz(iso, business.timezone));
        console.warn(`[${reqId}] requested slot ${startAt} not available. alternatives:`, alternatives);
        return NextResponse.json(
          {
            success: false,
            reason: 'slot_unavailable',
            message: alternatives.length
              ? `That time isn't available. Available times that day: ${alternatives.join(', ')}.`
              : `No availability on ${input.date}. Try another day.`,
            requested: { date: input.date, time: input.time },
            alternatives,
          },
          { status: 409 }
        );
      }
    } catch (err) {
      console.error(`[${reqId}] availability lookup failed:`, err);
    }
  }

  if (!dryRun && squareCustomerId) {
    try {
      const catResp = await client.catalog.object.get({ objectId: serviceVariationId });
      const serviceVariationVersion = catResp.object?.version;
      const bookingResp = await client.bookings.create({
        idempotencyKey: randomUUID(),
        booking: {
          locationId: business.squareLocationId,
          customerId: squareCustomerId,
          startAt,
          appointmentSegments: [
            {
              teamMemberId: business.squareTeamMemberId,
              serviceVariationId,
              serviceVariationVersion,
            },
          ],
        },
      });
      squareBookingId = bookingResp.booking?.id ?? undefined;
      console.log(`[${reqId}] booking ${squareBookingId}`);
    } catch (err) {
      const e = err as { errors?: unknown; message?: string };
      squareError = JSON.stringify(e.errors ?? e.message ?? err);
      console.error(`[${reqId}] bookings.create failed:`, squareError);
    }
  }

  const status = squareBookingId ? 'confirmed' : dryRun ? 'pending_dry_run' : 'pending';
  const [saved] = await db
    .insert(appointments)
    .values({
      businessId: business.id,
      customerName: input.name,
      customerPhone: normalizedPhone,
      serviceName: input.service,
      serviceVariationId,
      scheduledAt: new Date(startAt),
      status,
      squareCustomerId,
      squareBookingId,
      squareError,
      source: 'vapi',
      rawPayload: input as unknown as Record<string, unknown>,
    })
    .returning();

  notifyNewBooking(business, saved).catch((e) =>
    console.error(`[${reqId}] notify failed:`, e)
  );

  return NextResponse.json(
    {
      success: true,
      message: squareBookingId
        ? 'Appointment booked in Square and saved to dashboard'
        : 'Appointment saved to dashboard (Square write skipped or failed)',
      appointment: safeJson({
        id: saved.id,
        status: saved.status,
        scheduledAt: saved.scheduledAt,
        customerPhone: saved.customerPhone,
        squareCustomerId: saved.squareCustomerId,
        squareBookingId: saved.squareBookingId,
        squareError: saved.squareError,
      }),
    },
    { status: 200 }
  );
}

export async function GET() {
  return NextResponse.json({
    endpoint: 'POST /book-appointment',
    body: { name: 'string', phone: 'string', service: 'string', date: 'YYYY-MM-DD', time: 'HH:MM' },
  });
}
