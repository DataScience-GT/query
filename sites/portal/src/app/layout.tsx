import { Providers } from './providers';
import '@query/ui/styles';
import './globals.css';

export const metadata = {
  title: 'Portal - Enigma',
  description: 'Portal application',
};

import AuthHeader from '@/components/AuthHeader';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AuthHeader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
