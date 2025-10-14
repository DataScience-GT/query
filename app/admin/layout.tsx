// src/app/layout.tsx
import { ReactNode } from "react";

export const metadata = {
  title: "Hackathon Dashboard",
  description: "Manage check-ins, projects, and data with Supabase",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black text-yellow-400 min-h-screen flex flex-col">
        {/* Header / Navbar */}
        <header className="flex items-center justify-between p-4 border-b border-yellow-600">
          <h1 className="text-lg font-bold">Hackathon Portal</h1>

          {/* Example: hide full menu on mobile, show hamburger */}
          <nav className="hidden md:flex gap-6">
            <a href="/" className="hover:text-yellow-200">Home</a>
            <a href="/checkin" className="hover:text-yellow-200">Check-In</a>
            <a href="/projects" className="hover:text-yellow-200">Projects</a>
            <a href="/profile" className="hover:text-yellow-200">Profile</a>
          </nav>

          <div className="md:hidden">
            {/* Mobile menu button */}
            <button id="menuButton" className="text-yellow-400 focus:outline-none">
              ☰
            </button>
          </div>
        </header>

        {/* Mobile Menu */}
        <div id="mobileMenu" className="hidden flex-col bg-black border-b border-yellow-600 md:hidden">
          <a href="/" className="p-3 hover:bg-yellow-700/20">Home</a>
          <a href="/checkin" className="p-3 hover:bg-yellow-700/20">Check-In</a>
          <a href="/projects" className="p-3 hover:bg-yellow-700/20">Projects</a>
          <a href="/profile" className="p-3 hover:bg-yellow-700/20">Profile</a>
        </div>

        {/* Main Content */}
        <main className="flex-grow p-4 md:p-8">{children}</main>

        {/* Footer */}
        <footer className="p-4 border-t border-yellow-600 text-center text-sm text-yellow-500">
          © {new Date().getFullYear()} Hackathon Portal
        </footer>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              const menuButton = document.getElementById('menuButton');
              const mobileMenu = document.getElementById('mobileMenu');
              menuButton?.addEventListener('click', () => {
                mobileMenu?.classList.toggle('hidden');
              });
            `,
          }}
        />
      </body>
    </html>
  );
}
