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