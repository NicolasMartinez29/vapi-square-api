import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Booking Dashboard',
  description: 'Voice-driven appointments dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-neutral-50 text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
