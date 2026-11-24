import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Outbox - Email Job Scheduler',
  description: 'Production-grade distributed email job scheduler',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
