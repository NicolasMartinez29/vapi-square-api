import twilio from 'twilio';
import type { Appointment, Business } from './schema';

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;

function fmtTime(iso: Date | string, tz: string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

export async function notifyNewBooking(
  business: Business,
  appointment: Appointment
): Promise<{ smsSent: boolean; reason?: string }> {
  if (!business.notifyPhone) return { smsSent: false, reason: 'no_notify_phone' };
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    console.warn('[notify] Twilio credentials missing — SMS skipped');
    return { smsSent: false, reason: 'twilio_not_configured' };
  }

  const when = fmtTime(appointment.scheduledAt, business.timezone);
  const body = [
    `📅 Nueva cita en ${business.name}`,
    `${appointment.customerName} (${appointment.customerPhone})`,
    `${appointment.serviceName}`,
    `${when}`,
    appointment.squareBookingId
      ? `✅ Confirmada en Square (${appointment.squareBookingId.slice(0, 8)})`
      : `⚠️ Pendiente de confirmar en Square`,
  ].join('\n');

  try {
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    await client.messages.create({ from: TWILIO_FROM_NUMBER, to: business.notifyPhone, body });
    return { smsSent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[notify] Twilio send failed:', msg);
    return { smsSent: false, reason: msg };
  }
}
