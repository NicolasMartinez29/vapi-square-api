import { SquareClient, SquareEnvironment } from 'square';
import type { Business } from './schema';

export function squareClient(business: Pick<Business, 'squareAccessToken' | 'squareEnvironment'>) {
  return new SquareClient({
    token: business.squareAccessToken,
    environment:
      business.squareEnvironment === 'production'
        ? SquareEnvironment.Production
        : SquareEnvironment.Sandbox,
  });
}

export function safeJson<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
  ) as T;
}

export async function searchAvailableSlots(
  business: Business,
  serviceVariationId: string,
  dayStartUtcIso: string,
  dayEndUtcIso: string
): Promise<string[]> {
  const client = squareClient(business);
  const resp = await client.bookings.searchAvailability({
    query: {
      filter: {
        startAtRange: { startAt: dayStartUtcIso, endAt: dayEndUtcIso },
        locationId: business.squareLocationId,
        segmentFilters: [
          {
            serviceVariationId,
            teamMemberIdFilter: { any: [business.squareTeamMemberId] },
          },
        ],
      },
    },
  });
  const slots = resp.availabilities ?? [];
  return slots
    .map((s) => s.startAt)
    .filter((s): s is string => typeof s === 'string')
    .sort();
}
