// force-dynamic required: all portal pages use useSession() which needs runtime SessionProvider context
export const dynamic = 'force-dynamic';
export const revalidate = 0; // Disable ISR for authenticated pages

import { Providers } from './providers';
import './liquid-glass.css';
import PortalSidebar from '@/components/portal/PortalSidebar';

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <div className="font-mono bg-[var(--bg-primary)] text-[var(--text-primary)] min-h-screen flex flex-col md:flex-row">
        <PortalSidebar />
        <div className="flex-1 w-full md:pl-20 lg:pl-64 transition-all pt-16 md:pt-0">
          {children}
        </div>
      </div>
    </Providers>
  );
}