'use client';

import { useEffect, useState } from 'react';
import { Menu, Search, Bell, Moon, Sun } from 'lucide-react';
import Link from 'next/link';

type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function AdminHeader() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);


  return (
    <header className="sticky top-0 z-40 flex w-full items-center border-b border-white/5 bg-[#000000]/80 backdrop-blur-3xl px-4 py-3">
      <div className="flex h-16 items-center gap-4">
        {/* Toggle sidebar button */}
        <button
          onClick={() => {}}
          className="p-2 hover:bg-white/5 rounded-none transition-colors hidden lg:block"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5 text-gray-400" />
        </button>

        {/* Search bar */}
        <div className={`flex-1 max-w-md transition-all duration-300 ${showSearch ? 'opacity-100' : 'opacity-0'}`}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search events, hackathons..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-10 pr-4 bg-white/5 border border-white/10 rounded-none text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-[#EAFF2B]/50 focus:ring-2 focus:ring-[#EAFF2B]/20"
              autoFocus={showSearch}
              onBlur={() => setTimeout(() => setShowSearch(false), 200)}
            />
          </div>
        </div>

        {/* Search toggle */}
        <button
          onClick={() => setShowSearch(true)}
          className="p-2 hover:bg-white/5 rounded-none transition-colors hidden sm:block"
          aria-label="Toggle search"
        >
          <Search className="h-5 w-5 text-gray-400" />
        </button>

        {/* Notifications */}
        <button
          className="p-2 hover:bg-white/5 rounded-none transition-colors relative"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5 text-gray-400" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-sm bg-[#EAFF2B]" />
        </button>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
          className="p-2 hover:bg-white/5 rounded-none transition-colors"
          aria-label="Toggle dark mode"
        >
          {theme === 'dark' ? (
            <Moon className="h-5 w-5 text-gray-400" />
          ) : (
            <Sun className="h-5 w-5 text-gray-400" />
          )}
        </button>

        {/* Logo */}
        <Link href="/admin" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-none bg-gradient-to-br from-[#EAFF2B] to-[#EAFF2B] text-white shadow-[4px_4px_0_0_#EAFF2B]">
            <span className="font-black text-sm">DS</span>
          </div>
          <span className="hidden lg:block text-lg font-black text-white tracking-tight">
            DSGT Portal
          </span>
        </Link>
      </div>
    </header>
  );
}
