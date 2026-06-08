// force-dynamic required: all portal pages use useSession() which needs runtime SessionProvider context
export const dynamic = 'force-dynamic';
export const revalidate = 0; // Disable ISR for authenticated pages

import { Providers } from './providers';
import './liquid-glass.css';

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <div className="font-mono bg-black text-[#f5f5f7] min-h-screen">
        {children}
      </div>
    </Providers>
  );
}