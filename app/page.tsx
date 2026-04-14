import { redirect } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { appointments, type Appointment } from '@/lib/schema';
import { destroySession, getCurrentBusiness } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

async function logout() {
  'use server';
  await destroySession();
  redirect('/login');
}

async function setStatus(formData: FormData) {
  'use server';
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  const biz = await getCurrentBusiness();
  if (!biz || !id || !status) return;
  await db
    .update(appointments)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(appointments.id, id), eq(appointments.businessId, biz.id)));
  revalidatePath('/');
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 ring-amber-200',
  pending_dry_run: 'bg-blue-100 text-blue-800 ring-blue-200',
  confirmed: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  completed: 'bg-neutral-200 text-neutral-700 ring-neutral-300',
  cancelled: 'bg-red-100 text-red-800 ring-red-200',
  no_show: 'bg-red-100 text-red-800 ring-red-200',
};

function fmtDateTime(d: Date, tz: string) {
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

export default async function DashboardPage() {
  const biz = await getCurrentBusiness();
  if (!biz) redirect('/login');

  const rows = await db
    .select()
    .from(appointments)
    .where(eq(appointments.businessId, biz.id))
    .orderBy(desc(appointments.scheduledAt))
    .limit(200);

  const now = Date.now();
  const upcoming = rows.filter((r) => r.scheduledAt.getTime() >= now && r.status !== 'cancelled');
  const past = rows.filter((r) => r.scheduledAt.getTime() < now || r.status === 'cancelled');
  const pendingCount = rows.filter((r) => r.status === 'pending' || r.status === 'pending_dry_run').length;

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <header className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{biz.name}</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {rows.length} citas registradas · {pendingCount} pendientes
          </p>
        </div>
        <form action={logout}>
          <button className="text-sm text-neutral-500 hover:text-neutral-900 transition">
            Salir
          </button>
        </form>
      </header>

      <Section title="Próximas" rows={upcoming} timezone={biz.timezone} setStatus={setStatus} />
      <Section title="Historial" rows={past} timezone={biz.timezone} setStatus={setStatus} muted />
    </main>
  );
}

function Section({
  title,
  rows,
  timezone,
  setStatus,
  muted,
}: {
  title: string;
  rows: Appointment[];
  timezone: string;
  setStatus: (fd: FormData) => Promise<void>;
  muted?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mb-10">
      <h2 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${muted ? 'text-neutral-400' : 'text-neutral-600'}`}>
        {title}
      </h2>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="bg-white border border-neutral-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{r.customerName}</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${
                    STATUS_STYLES[r.status] ?? 'bg-neutral-100 text-neutral-700 ring-neutral-200'
                  }`}
                >
                  {r.status}
                </span>
              </div>
              <div className="text-sm text-neutral-500 mt-0.5">
                {r.serviceName} · {fmtDateTime(r.scheduledAt, timezone)} · {r.customerPhone}
              </div>
              {r.squareError && (
                <details className="mt-1">
                  <summary className="text-xs text-red-600 cursor-pointer">Error Square</summary>
                  <pre className="text-xs text-red-700 mt-1 whitespace-pre-wrap break-all">{r.squareError}</pre>
                </details>
              )}
            </div>
            <form action={setStatus} className="flex items-center gap-1.5 shrink-0">
              <input type="hidden" name="id" value={r.id} />
              {['confirmed', 'completed', 'cancelled'].map((s) => (
                <button
                  key={s}
                  type="submit"
                  name="status"
                  value={s}
                  className="text-xs px-2.5 py-1 rounded-md border border-neutral-300 hover:bg-neutral-100 transition"
                >
                  {s === 'confirmed' ? 'Confirmar' : s === 'completed' ? 'Hecha' : 'Cancelar'}
                </button>
              ))}
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
