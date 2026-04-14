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
