// force-dynamic required: all portal pages use useSession() which needs runtime SessionProvider context
export const dynamic = 'force-dynamic';
export const revalidate = 0; // Disable ISR for authenticated pages

import { Providers } from './providers';
import './liquid-glass.css';
import PortalWrapper from '@/components/portal/PortalWrapper';

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <PortalWrapper>
        {children}
      </PortalWrapper>
    </Providers>
  );
}