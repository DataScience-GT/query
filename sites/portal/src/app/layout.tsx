import './globals.css';
import { Providers } from './providers';

export const metadata = {
  title: 'Portal',
  description: 'A modern TRPC + Next.js portal',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gradient-to-br from-purple-600 via-indigo-500 to-blue-400">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
