require('dotenv').config();
const express = require('express');
const { SquareClient, SquareEnvironment } = require('square');
const { randomUUID } = require('crypto');

const {
  SQUARE_ACCESS_TOKEN,
  SQUARE_ENVIRONMENT = 'sandbox',
  SQUARE_LOCATION_ID,
  SQUARE_TEAM_MEMBER_ID,
  SERVICE_VARIATION_MAP = '{}',
  TIMEZONE = 'America/Chicago',
  DRY_RUN = 'false',
} = process.env;

const dryRun = String(DRY_RUN).toLowerCase() === 'true';

function normalizeServiceKey(raw) {
  return String(raw)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

let serviceMap = {};
try {
  const rawMap = JSON.parse(SERVICE_VARIATION_MAP);
  for (const [k, v] of Object.entries(rawMap)) {
    serviceMap[normalizeServiceKey(k)] = v;
  }
} catch (_err) {
  console.error('SERVICE_VARIATION_MAP must be valid JSON');
}

const client = SQUARE_ACCESS_TOKEN
  ? new SquareClient({
      token: SQUARE_ACCESS_TOKEN,
      environment:
        SQUARE_ENVIRONMENT === 'production'
          ? SquareEnvironment.Production
          : SquareEnvironment.Sandbox,
    })
  : null;

function toRFC3339(dateStr, timeStr, timeZone) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi);
  const offsetMs = tzOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offsetMs).toISOString();
}

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

function safeJson(obj) {
  return JSON.parse(JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

const app = express();
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    service: 'vapi-square-api',
    status: 'running',
    environment: SQUARE_ENVIRONMENT,
    endpoints: ['GET /health', 'POST /book-appointment'],
  });
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    environment: SQUARE_ENVIRONMENT,
    configured: Boolean(client && SQUARE_LOCATION_ID && SQUARE_TEAM_MEMBER_ID),
    dryRun,
  });
});

app.post('/book-appointment', async (req, res) => {
  const reqId = randomUUID().slice(0, 8);
  const { name, phone, service, date, time } = req.body || {};
  console.log(`[${reqId}] -> POST /book-appointment`, { name, phone, service, date, time });

  if (!client || !SQUARE_LOCATION_ID || !SQUARE_TEAM_MEMBER_ID) {
    return res.status(500).json({
      success: false,
      error: 'Server not configured. Missing SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, or SQUARE_TEAM_MEMBER_ID env vars.',
    });
  }

  if (!name || !phone || !service || !date || !time) {
    console.warn(`[${reqId}] missing required fields`);
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: name, phone, service, date, time',
    });
  }

  const serviceKey = normalizeServiceKey(service);
  const serviceVariationId = serviceMap[serviceKey];
  if (!serviceVariationId) {
    console.warn(`[${reqId}] unknown service "${service}"`);
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
  } catch (_err) {
    return res.status(400).json({
      success: false,
      error: `Could not parse date/time. Expect date=YYYY-MM-DD, time=HH:MM. Got date="${date}", time="${time}".`,
    });
  }

  try {
    let customerId;
    const searchResp = await client.customers.search({
      query: { filter: { phoneNumber: { exact: normalizedPhone } } },
    });
    const existing = searchResp.customers?.[0];
    if (existing) {
      customerId = existing.id;
      console.log(`[${reqId}] found existing customer ${customerId}`);
    } else {
      const createResp = await client.customers.create({
        idempotencyKey: randomUUID(),
        givenName,
        familyName,
        phoneNumber: normalizedPhone,
      });
      customerId = createResp.customer?.id;
      console.log(`[${reqId}] created new customer ${customerId}`);
    }

    if (!customerId) {
      return res.status(502).json({ success: false, error: 'Failed to resolve customer id' });
    }

    // Fetch the current version of the service variation (required by Square).
    let serviceVariationVersion;
    try {
      const catResp = await client.catalog.object.get({ objectId: serviceVariationId });
      serviceVariationVersion = catResp.object?.version;
    } catch (_e) {
      return res.status(502).json({
        success: false,
        error: `Could not fetch service variation ${serviceVariationId} from Square catalog`,
      });
    }

    if (dryRun) {
      console.log(`[${reqId}] DRY_RUN=true — skipping bookings.create, returning simulated success`);
      return res.status(200).json({
        success: true,
        dryRun: true,
        message: 'Appointment flow validated (DRY_RUN, no booking written to Square)',
        booking: {
          id: `dryrun_${reqId}`,
          status: 'PENDING_SUBSCRIPTION',
          startAt,
          customerId,
          locationId: SQUARE_LOCATION_ID,
          teamMemberId: SQUARE_TEAM_MEMBER_ID,
          serviceVariationId,
          serviceVariationVersion: String(serviceVariationVersion),
        },
      });
    }

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
            serviceVariationVersion,
          },
        ],
      },
    });

    const booking = bookingResp.booking;
    console.log(`[${reqId}] booking created id=${booking?.id} status=${booking?.status} startAt=${booking?.startAt}`);
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
    console.error(`[${reqId}] Square API error:`, JSON.stringify(squareErrors || { message: err.message }, null, 2));
    return res.status(502).json({
      success: false,
      error: 'Square API request failed',
      details: squareErrors || err.message,
    });
  }
});

module.exports = app;
