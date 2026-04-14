export function normalizeServiceKey(raw: string): string {
  return String(raw)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function buildServiceMap(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[normalizeServiceKey(k)] = v;
  }
  return out;
}

export function normalizePhone(phone: string): string {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return phone.startsWith('+') ? phone : `+${digits}`;
}

export function splitName(full: string): { givenName: string; familyName: string } {
  const parts = String(full).trim().split(/\s+/);
  return { givenName: parts[0] || '', familyName: parts.slice(1).join(' ') || '' };
}

export function normalizeDate(raw: string): string {
  const s = String(raw).trim();

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const slashOrDash = s.match(/^(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})$/);
  if (slashOrDash) {
    let [, a, b, c] = slashOrDash;
    let y: string, m: string, d: string;
    if (a.length === 4) {
      y = a; m = b; d = c;
    } else if (c.length === 4) {
      m = a; d = b; y = c;
    } else {
      m = a; d = b;
      const yy = parseInt(c, 10);
      y = String(yy < 70 ? 2000 + yy : 1900 + yy);
    }
    return `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  throw new Error(`Could not parse date: "${raw}"`);
}

export function normalizeTime(raw: string): string {
  const s = String(raw).trim().toLowerCase();

  const ampm = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm)$/);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const mi = parseInt(ampm[2] ?? '0', 10);
    const isPm = ampm[3].startsWith('p');
    if (h === 12) h = isPm ? 12 : 0;
    else if (isPm) h += 12;
    return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  }

  const hhmm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const h = parseInt(hhmm[1], 10);
    const mi = parseInt(hhmm[2], 10);
    if (h > 23 || mi > 59) throw new Error(`Invalid time: "${raw}"`);
    return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  }

  const hOnly = s.match(/^(\d{1,2})$/);
  if (hOnly) {
    const h = parseInt(hOnly[1], 10);
    if (h > 23) throw new Error(`Invalid time: "${raw}"`);
    return `${String(h).padStart(2, '0')}:00`;
  }

  throw new Error(`Could not parse time: "${raw}"`);
}

export function toRFC3339(dateStr: string, timeStr: string, timeZone: string): string {
  const isoDate = normalizeDate(dateStr);
  const isoTime = normalizeTime(timeStr);
  const [y, mo, d] = isoDate.split('-').map(Number);
  const [h, mi] = isoTime.split(':').map(Number);
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi);
  const offsetMs = tzOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offsetMs).toISOString();
}

export function dayBoundsUtc(dateStr: string, timeZone: string): { startUtcIso: string; endUtcIso: string } {
  const startUtcIso = toRFC3339(dateStr, '00:00', timeZone);
  const endUtcIso = toRFC3339(dateStr, '23:59', timeZone);
  return { startUtcIso, endUtcIso };
}

export function formatSlotInTz(utcIso: string, timeZone: string): string {
  const d = new Date(utcIso);
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(
    +parts.year, +parts.month - 1, +parts.day,
    +parts.hour, +parts.minute, +parts.second
  );
  return asUTC - date.getTime();
}
