// force-dynamic required: all portal pages use useSession() which needs runtime SessionProvider context
export const dynamic = 'force-dynamic';

import { Providers } from './providers';
import './liquid-glass.css';
// import './globals.css';

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>{children}</Providers>
  );
}