# Vapi ↔ Square Appointments API

Node.js/Express backend that receives booking data from a Vapi AI receptionist and creates the appointment in Square.

## Setup

1. **Install dependencies**
   ```bash
   cd C:\Users\nicos\vapi-square-api
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and fill in:
   - `SQUARE_ACCESS_TOKEN` — from https://developer.squareup.com/apps (use **Sandbox** token first to test)
   - `SQUARE_ENVIRONMENT` — `sandbox` or `production`
   - `SQUARE_LOCATION_ID` — your Square location (Dashboard → Account & Settings → Locations)
   - `SQUARE_TEAM_MEMBER_ID` — the staff member (barber) who takes the booking. Get it via `GET /v2/team-members/search` or the Square Dashboard.
   - `SERVICE_VARIATION_MAP` — JSON mapping human service names → Square service variation IDs. You can find these under **Appointments → Services** in the Dashboard, or via `GET /v2/catalog/list?types=ITEM`. Example:
     ```json
     {"haircut":"ABC123","beard trim":"DEF456","haircut and beard":"GHI789"}
     ```
   - `TIMEZONE` — e.g. `America/Chicago` (Sioux Falls is Central)

3. **Run the server**
   ```bash
   npm start        # production
   npm run dev      # auto-reload on file changes
   ```
   Server starts on `http://localhost:3000`.

## Endpoint

### `POST /book-appointment`

**Request body (JSON):**
```json
{
  "name": "John Smith",
  "phone": "+16055551234",
  "service": "haircut",
  "date": "2026-04-20",
  "time": "14:30"
}
```

Field notes:
- `phone` — accepts `+16055551234`, `6055551234`, `(605) 555-1234`; normalized to E.164.
- `service` — case-insensitive; must match a key in `SERVICE_VARIATION_MAP`.
- `date` — `YYYY-MM-DD`.
- `time` — 24-hour `HH:MM` in the configured `TIMEZONE`.

**Success (200):**
```json
{
  "success": true,
  "message": "Appointment booked successfully",
  "booking": {
    "id": "zkn3...",
    "status": "ACCEPTED",
    "startAt": "2026-04-20T19:30:00Z",
    "customerId": "CUST_...",
    "locationId": "LOC_..."
  }
}
```

**Failure (400 / 502):**
```json
{
  "success": false,
  "error": "Square API request failed",
  "details": [{ "code": "...", "detail": "..." }]
}
```

### `GET /health`
Returns `{ "ok": true }`.

## Testing locally

```bash
curl -X POST http://localhost:3000/book-appointment \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Smith",
    "phone": "605-555-1234",
    "service": "haircut",
    "date": "2026-04-20",
    "time": "14:30"
  }'
```

## Hooking up Vapi

In your Vapi assistant, add a **Tool / Function Call** that POSTs to `https://<your-public-url>/book-appointment` with the JSON body above. To expose localhost publicly during testing, use `ngrok http 3000` and point Vapi at the ngrok URL.

## What it does

1. Normalizes the phone number to E.164.
2. Searches Square customers by phone; reuses the record if found, otherwise creates one.
3. Creates a booking with the mapped service variation, team member, and start time (converted from your local timezone to RFC3339 UTC).
4. Returns a clean success/failure response.

## Notes / caveats

- `serviceVariationVersion` is set to `1n`. If you've edited a service in Square, fetch the current version with `GET /v2/catalog/object/{id}` and update the code, or extend the handler to look it up dynamically.
- Square booking APIs require that **Square Appointments** be enabled on the seller account and that the team member has booking availability configured.
- Start with `SQUARE_ENVIRONMENT=sandbox` and a sandbox access token until the flow works end-to-end.
