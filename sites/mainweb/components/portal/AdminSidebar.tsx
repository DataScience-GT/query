'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
  LayoutDashboard,
  Calendar,
  ClipboardList,
  Settings,
  BarChart3,
  Users,
  FileText,
  Code,
  LogOut,
  Menu,
} from 'lucide-react';

type AdminRoute = {
  name: string;
  href: string;
  icon: React.ElementType;
};

const adminRoutes: AdminRoute[] = [
  { name: 'Events', href: '/admin', icon: LayoutDashboard },
  { name: 'Hackathons', href: '/admin/hackathons', icon: Code },
  { name: 'Judging', href: '/admin/judging', icon: ClipboardList },
  { name: 'Attendees', href: '/admin/attendees', icon: Users },
  { name: 'Projects', href: '/admin/projects', icon: FileText },
  { name: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { name: 'Settings', href: '/admin/settings', icon: Settings },
];

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { LayoutDashboard, Calendar, ClipboardList, Settings, BarChart3, Users, FileText, Code, LogOut, Menu } from 'lucide-react';

type AdminRoute = {
  name: string;
  href: string;
  icon: React.ElementType;
};

const adminRoutes: AdminRoute[] = [
  { name: 'Events', href: '/admin', icon: LayoutDashboard },
  { name: 'Hackathons', href: '/admin/hackathons', icon: Code },
  { name: 'Judging', href: '/admin/judging', icon: ClipboardList },
  { name: 'Attendees', href: '/admin/attendees', icon: Users },
  { name: 'Projects', href: '/admin/projects', icon: FileText },
  { name: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { name: 'Settings', href: '/admin/settings', icon: Settings },
];

export default function AdminSidebar() {
  const [isOpen, setIsOpen] = useState(true);
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div className={`fixed left-0 top-0 z-50 h-screen border-r bg-[#0a0c10] dark:bg-darkBlue/80 backdrop-blur-3xl transition-all duration-300 ${isOpen ? 'w-64' : 'w-20'}`}>
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-white/5 px-4">
        {isOpen && (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#00A8A8] to-emerald-600 text-white shadow-lg shadow-[#00A8A8]/20">
              <Code className="h-6 w-6" />
            </div>
            <span className="text-lg font-black text-white tracking-tight">
              GreenLight
            </span>
          </div>
        )}
        {!isOpen && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#00A8A8] to-emerald-600 text-white">
            <Code className="h-5 w-5" />
          </div>
        )}

        {/* Toggle button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-white/5 rounded-lg transition-colors"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5 text-gray-400" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {adminRoutes.map((route) => {
            const isActive = pathname === route.href || pathname.startsWith(route.href + '/');
            return (
              <Link
                key={route.href}
                href={route.href}
                className={`group flex items-center gap-3 rounded-xl px-3 py-3 transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-[#00A8A8]/10 to-transparent text-[#00A8A8] font-medium border-l-2 border-[#00A8A8]'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <route.icon className={`h-5 w-5 flex-shrink-0 transition-colors ${isActive ? 'text-[#00A8A8]' : 'text-gray-500 group-hover:text-white'}`} />
                {isOpen && <span className="text-sm">{route.name}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User section */}
      <div className="border-t border-white/5 px-3 py-4">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <img src={session?.user?.image || '/avatars/default.png'} alt={session?.user?.name || 'User'} className="h-10 w-10 rounded-full border border-white/10 object-cover" />
          {isOpen && (
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium text-white truncate">{session?.user?.name || 'Admin User'}</p>
              <p className="text-xs text-gray-500 truncate">{session?.user?.email || 'Admin'}</p>
            </div>
          )}
          {!isOpen && (
            <img src={session?.user?.image || '/avatars/default.png'} alt="User" className="h-8 w-8 rounded-full border border-white/10 object-cover" />
          )}
        </div>
        {isOpen && (
          <button onClick={() => signOut({ callbackUrl: '/login' })} className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-gray-500 hover:bg-red-500/10 hover:text-red-400 transition-colors">
            <LogOut className="h-5 w-5" />
            <span className="text-sm">Sign Out</span>
          </button>
        )}
      </div>
    </div>
  );
}
