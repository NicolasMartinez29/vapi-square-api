require('dotenv').config();
const express = require('express');
const { SquareClient, SquareEnvironment } = require('square');
const { randomUUID } = require('crypto');

const app = express();
app.use(express.json());

// --- Config ---
const {
  SQUARE_ACCESS_TOKEN,
  SQUARE_ENVIRONMENT = 'sandbox',
  SQUARE_LOCATION_ID,
  SQUARE_TEAM_MEMBER_ID,
  SERVICE_VARIATION_MAP = '{}',
  TIMEZONE = 'America/Chicago',
  PORT = 3000,
} = process.env;

if (!SQUARE_ACCESS_TOKEN || !SQUARE_LOCATION_ID || !SQUARE_TEAM_MEMBER_ID) {
  console.error('Missing required env vars: SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, SQUARE_TEAM_MEMBER_ID');
  process.exit(1);
}

let serviceMap;
try {
  serviceMap = JSON.parse(SERVICE_VARIATION_MAP);
} catch (err) {
  console.error('SERVICE_VARIATION_MAP must be valid JSON');
  process.exit(1);
}

const client = new SquareClient({
  token: SQUARE_ACCESS_TOKEN,
  environment:
    SQUARE_ENVIRONMENT === 'production'
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
});

// --- Helpers ---

// Convert a local date + time (e.g. "2026-04-20" + "14:30") to an RFC3339 UTC timestamp
// honoring the configured IANA timezone. Uses Intl to compute the offset.
function toRFC3339(dateStr, timeStr, timeZone) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);

  // Build a UTC date from the components, then adjust by the tz offset at that instant.
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi);
  const offsetMs = tzOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offsetMs).toISOString();
}

// Returns the tz offset (in ms) for a given instant in a given IANA zone.
function tzOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map(p => [p.type, p.value]));
  const asUTC = Date.UTC(
    +parts.year, +parts.month - 1, +parts.day,
    +parts.hour, +parts.minute, +parts.second
  );
  return asUTC - date.getTime();
}

function normalizePhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return phone.startsWith('+') ? phone : `+${digits}`;
}

function splitName(full) {
  const parts = String(full).trim().split(/\s+/);
  return { givenName: parts[0] || '', familyName: parts.slice(1).join(' ') || '' };
}

// Serialize BigInt fields in Square responses for JSON.
function safeJson(obj) {
  return JSON.parse(JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

// --- Route ---
app.post('/book-appointment', async (req, res) => {
  const reqId = randomUUID().slice(0, 8);
  const { name, phone, service, date, time } = req.body || {};
  console.log(`[${reqId}] → POST /book-appointment`, { name, phone, service, date, time });

  if (!name || !phone || !service || !date || !time) {
    console.warn(`[${reqId}] ✗ missing required fields`);
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: name, phone, service, date, time',
    });
  }

  const serviceKey = String(service).toLowerCase().trim();
  const serviceVariationId = serviceMap[serviceKey];
  if (!serviceVariationId) {
    console.warn(`[${reqId}] ✗ unknown service "${service}"`);
    return res.status(400).json({
      success: false,
      error: `Unknown service "${service}". Known services: ${Object.keys(serviceMap).join(', ') || '(none configured)'}`,
    });
  }

  const normalizedPhone = normalizePhone(phone);
  const { givenName, familyName } = splitName(name);

  let startAt;
  try {
    startAt = toRFC3339(date, time, TIMEZONE);
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: `Could not parse date/time. Expect date=YYYY-MM-DD, time=HH:MM. Got date="${date}", time="${time}".`,
    });
  }

  try {
    // 1. Find or create the customer (search by phone to avoid duplicates).
    let customerId;
    const searchResp = await client.customers.search({
      query: { filter: { phoneNumber: { exact: normalizedPhone } } },
    });
    const existing = searchResp.customers?.[0];
    if (existing) {
      customerId = existing.id;
      console.log(`[${reqId}] ✓ found existing customer ${customerId}`);
    } else {
      const createResp = await client.customers.create({
        idempotencyKey: randomUUID(),
        givenName,
        familyName,
        phoneNumber: normalizedPhone,
      });
      customerId = createResp.customer?.id;
      console.log(`[${reqId}] ✓ created new customer ${customerId}`);
    }

    if (!customerId) {
      return res.status(502).json({ success: false, error: 'Failed to resolve customer id' });
    }

    // 2. Create the booking.
    const bookingResp = await client.bookings.create({
      idempotencyKey: randomUUID(),
      booking: {
        locationId: SQUARE_LOCATION_ID,
        customerId,
        startAt,
        appointmentSegments: [
          {
            teamMemberId: SQUARE_TEAM_MEMBER_ID,
            serviceVariationId,
            serviceVariationVersion: 1n,
          },
        ],
      },
    });

    const booking = bookingResp.booking;
    console.log(`[${reqId}] ✓ booking created id=${booking?.id} status=${booking?.status} startAt=${booking?.startAt}`);
    return res.status(200).json({
      success: true,
      message: 'Appointment booked successfully',
      booking: safeJson({
        id: booking?.id,
        status: booking?.status,
        startAt: booking?.startAt,
        customerId: booking?.customerId,
        locationId: booking?.locationId,
      }),
    });
  } catch (err) {
    const squareErrors = err?.errors || err?.result?.errors;
    console.error(`[${reqId}] ✗ Square API error:`, JSON.stringify(squareErrors || { message: err.message, stack: err.stack }, null, 2));
    return res.status(502).json({
      success: false,
      error: 'Square API request failed',
      details: squareErrors || err.message,
    });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`vapi-square-api listening on port ${PORT} (${SQUARE_ENVIRONMENT})`);
});
