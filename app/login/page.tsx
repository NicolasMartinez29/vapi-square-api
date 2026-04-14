import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { businesses } from '@/lib/schema';
import { createSession, getCurrentBusiness, verifyPassword } from '@/lib/auth';

async function login(formData: FormData) {
  'use server';
  const slug = String(formData.get('slug') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!slug || !password) return;

  const [biz] = await db.select().from(businesses).where(eq(businesses.slug, slug)).limit(1);
  if (!biz) redirect('/login?error=invalid');
  if (!verifyPassword(password, biz.ownerPasswordHash)) redirect('/login?error=invalid');
  await createSession(biz.id);
  redirect('/');
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const current = await getCurrentBusiness();
  if (current) redirect('/');
  const { error } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form
        action={login}
        className="w-full max-w-sm bg-white border border-neutral-200 rounded-2xl p-8 shadow-sm space-y-5"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Booking dashboard</h1>
          <p className="text-sm text-neutral-500 mt-1">Acceso del dueño</p>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-neutral-700">Negocio</span>
          <input
            name="slug"
            placeholder="laras"
            autoComplete="username"
            required
            className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-neutral-700">Contraseña</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </label>

        {error && (
          <p className="text-sm text-red-600">Credenciales inválidas. Intenta de nuevo.</p>
        )}

        <button
          type="submit"
          className="w-full bg-neutral-900 text-white text-sm font-medium rounded-lg py-2.5 hover:bg-neutral-800 transition"
        >
          Entrar
        </button>
      </form>
    </main>
  );
}
