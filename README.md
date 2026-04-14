# Vapi → Square Booking Platform

Voice receptionist (Vapi) → API → Square Appointments + dashboard.
Built multi-tenant from day one so the same deployment can serve many businesses.

**Production:** https://vapi-square-api.vercel.app
**Dashboard:** https://vapi-square-api.vercel.app/login

## Architecture

```
Vapi call → POST /book-appointment
              ├─ resolve business by slug (or default to first)
              ├─ create/find Square customer (works on Free plan)
              ├─ if !dryRun: create Square booking (needs Appointments Plus)
              ├─ insert appointment row in Postgres (always)
              └─ fire-and-forget Twilio SMS to business.notifyPhone

Owner browser → /login → /                (cookie session, scrypt password)
                          ├─ list upcoming + history
                          └─ confirm / complete / cancel buttons
```

Stack: Next.js 15 (App Router), Neon Postgres, Drizzle ORM, Square SDK v44,
Twilio SMS, Tailwind, scrypt + sha256 sessions.

## Endpoints

| Method | Path                  | Notes                                       |
|--------|-----------------------|---------------------------------------------|
| POST   | `/book-appointment`   | Vapi target. Body: name, phone, service, date (YYYY-MM-DD), time (HH:MM), [business] |
| GET    | `/health`             | DB + Twilio status                          |
| GET    | `/`                   | Dashboard (auth required)                   |
| GET    | `/login`              | Owner login                                 |

## Database schema

- `businesses` — one row per client. Holds Square credentials, location id, team
  member id, service map (JSON), timezone, owner password hash, notification phone,
  dry-run flag.
- `appointments` — every booking ever attempted. FK to business. Stores Square
  customer id, Square booking id (if successful), Square error (if failed),
  status (pending / pending_dry_run / confirmed / completed / cancelled / no_show),
  raw Vapi payload.
- `sessions` — cookie sessions (sha256-hashed token, 14-day expiry).

## Onboarding a new client (resale playbook)

1. **Get from the client:**
   - Square Access Token (production), Location ID, Team Member ID
   - List of services and their Square Service Variation IDs
   - Owner phone for SMS notifications
   - Owner timezone (defaults to America/Chicago)

2. **Insert their row** by running the seed script with their values:
   ```bash
   DATABASE_URL=... \
   SQUARE_ACCESS_TOKEN=... \
   SQUARE_LOCATION_ID=... \
   SQUARE_TEAM_MEMBER_ID=... \
   SEED_PASSWORD=... \
   SEED_NOTIFY_PHONE=+15555550199 \
   SEED_DRY_RUN=true \
   SEED_NAME="Client Name" \
   SEED_SLUG="client-slug" \
   npm run seed
   ```
   (Edit `scripts/seed.ts` to swap in their actual SERVICE_MAP.)

3. **Wire Vapi:** point the booking tool to
   `POST https://vapi-square-api.vercel.app/book-appointment`
   with body `{name, phone, service, date, time, business: "<their-slug>"}`.

4. **When client is on Square Appointments Plus**, flip `dryRun=false` for that
   business via SQL: `UPDATE businesses SET dry_run = 'false' WHERE slug = '...';`

## Required env vars (Vercel)

- `DATABASE_URL` — set automatically by Neon integration.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` — for SMS.
  Without these, bookings still save and the dashboard works; only SMS is skipped.

## Local dev

```bash
npm install
vercel env pull .env.local --environment=development
npm run dev
# http://localhost:3000
```

## Migrations

```bash
npm run db:generate   # after schema changes
npm run db:migrate    # apply
```
