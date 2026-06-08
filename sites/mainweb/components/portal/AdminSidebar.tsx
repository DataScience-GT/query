'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { LayoutDashboard, Code, ClipboardList, Users, FileText, BarChart3, Settings, LogOut, Menu, QrCode, Zap, X } from 'lucide-react';

const clubRoutes = [
  { name: 'Events', href: '/admin', icon: LayoutDashboard },
  { name: 'Attendees', href: '/admin/attendees', icon: Users },
  { name: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { name: 'Settings', href: '/admin/settings', icon: Settings },
];

const hackathonRoutes = [
  { name: 'Hackathons', href: '/admin/hackathons', icon: Code },
  { name: 'Judging', href: '/admin/judging', icon: ClipboardList },
  { name: 'Projects', href: '/admin/projects', icon: FileText },
];

export default function AdminSidebar() {
  const [isOpen, setIsOpen] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();

  // Prevent scrolling when mobile menu is open
  useEffect(() => {
    if (isMobileOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; }
  }, [isMobileOpen]);

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[#000000]/95 backdrop-blur-xl border-b border-white/5 z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-none bg-gradient-to-br from-[#EAFF2B] to-[#EAFF2B] text-white shadow-[4px_4px_0_0_#EAFF2B]">
            <Code className="h-4 w-4" />
          </div>
          <span className="text-lg font-black text-white tracking-tight">DSGT Portal</span>
        </div>
        <button onClick={() => setIsMobileOpen(true)} className="p-2 hover:bg-white/5 rounded-none transition-colors">
          <Menu className="h-6 w-6 text-gray-300" />
        </button>
      </div>

      {/* MOBILE FULLSCREEN MENU (Centered) */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-[#000000]/98 backdrop-blur-3xl flex flex-col items-center pt-20 pb-10 px-6 overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
          <button onClick={() => setIsMobileOpen(false)} className="absolute top-4 right-4 p-3 bg-white/5 rounded-sm hover:bg-white/10 transition-colors">
            <X className="w-6 h-6 text-white" />
          </button>

          <div className="w-full max-w-sm flex flex-col items-center gap-10 mt-4">
            
            <div className="w-full text-center">
              <h3 className="text-xs uppercase tracking-widest text-[#EAFF2B] font-bold mb-6 flex flex-col items-center gap-2">
                <QrCode className="w-6 h-6 opacity-50" />
                Club Events
              </h3>
              <div className="flex flex-col gap-3">
                {clubRoutes.map(route => {
                  const isActive = pathname === route.href || (route.href !== '/admin' && pathname.startsWith(route.href + '/'));
                  return (
                    <Link
                      key={route.href}
                      href={route.href}
                      onClick={() => setIsMobileOpen(false)}
                      className={`flex items-center justify-center gap-3 py-4 rounded-none transition-all ${
                        isActive ? 'bg-[#EAFF2B]/10 text-[#EAFF2B] border border-[#EAFF2B]/20 font-bold' : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <route.icon className="w-5 h-5" />
                      <span className="text-lg">{route.name}</span>
                    </Link>
                  )
                })}
              </div>
            </div>

            <div className="w-full h-px bg-white/10" />

            <div className="w-full text-center">
              <h3 className="text-xs uppercase tracking-widest text-[#EAFF2B] font-bold mb-6 flex flex-col items-center gap-2">
                <Zap className="w-6 h-6 opacity-50" />
                Hackathon Hub
              </h3>
              <div className="flex flex-col gap-3">
                {hackathonRoutes.map(route => {
                  const isActive = pathname === route.href || pathname.startsWith(route.href + '/');
                  return (
                    <Link
                      key={route.href}
                      href={route.href}
                      onClick={() => setIsMobileOpen(false)}
                      className={`flex items-center justify-center gap-3 py-4 rounded-none transition-all ${
                        isActive ? 'bg-[#EAFF2B]/10 text-[#EAFF2B] border border-[#EAFF2B]/20 font-bold' : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <route.icon className="w-5 h-5" />
                      <span className="text-lg">{route.name}</span>
                    </Link>
                  )
                })}
              </div>
            </div>

            {/* Mobile User Section */}
            <div className="mt-auto w-full pt-8 flex flex-col items-center gap-4">
               <div className="flex items-center gap-3 bg-white/5 px-6 py-4 rounded-sm border border-white/10">
                  <img src={session?.user?.image || '/avatars/default.png'} alt="" className="h-10 w-10 rounded-sm border border-white/10 object-cover" />
                  <div className="text-left max-w-[150px]">
                     <p className="text-sm font-bold text-white truncate">{session?.user?.name || 'Admin User'}</p>
                  </div>
               </div>
               <button onClick={() => signOut({ callbackUrl: '/login' })} className="flex items-center gap-2 text-red-400 hover:text-red-300 font-bold uppercase tracking-wider text-sm py-2">
                 <LogOut className="w-4 h-4" /> Sign Out
               </button>
            </div>

          </div>
        </div>
      )}

      {/* DESKTOP SIDEBAR */}
      <div className={`hidden md:flex flex-col fixed left-0 top-0 z-40 h-screen border-r border-white/5 bg-[#000000] dark:bg-darkBlue/80 backdrop-blur-3xl transition-all duration-300 ${isOpen ? 'w-64' : 'w-20'}`}>
        
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-white/5 px-4">
          {isOpen && (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-none bg-gradient-to-br from-[#EAFF2B] to-[#EAFF2B] text-white shadow-[4px_4px_0_0_#EAFF2B]">
                <Code className="h-6 w-6" />
              </div>
              <span className="text-lg font-black text-white tracking-tight">DSGT Portal</span>
            </div>
          )}
          {!isOpen && (
            <div className="flex h-10 w-10 items-center justify-center rounded-none bg-gradient-to-br from-[#EAFF2B] to-[#EAFF2B] text-white">
              <Code className="h-5 w-5" />
            </div>
          )}
          <button onClick={() => setIsOpen(!isOpen)} className="p-2 hover:bg-white/5 rounded-none transition-colors">
            <Menu className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {/* Club Events Section */}
          <div className="mb-1">
            {isOpen && (
              <div className="flex items-center gap-2 px-3 pb-2 mb-1">
                <QrCode className="h-3 w-3 text-[#EAFF2B]/60 flex-shrink-0" />
                <span className="text-[10px] font-mono text-[#EAFF2B]/60 uppercase tracking-[0.2em]">Club Events</span>
              </div>
            )}
            {!isOpen && <div className="w-8 h-px bg-[#EAFF2B]/20 mx-auto mb-3" />}
            <div className="space-y-1">
              {clubRoutes.map((route) => {
                const isActive = pathname === route.href || (route.href !== '/admin' && pathname.startsWith(route.href + '/'));
                return (
                  <Link
                    key={route.href}
                    href={route.href}
                    className={`group flex items-center gap-3 rounded-none px-3 py-3 transition-all ${
                      isActive ? 'bg-gradient-to-r from-[#EAFF2B]/10 to-transparent text-[#EAFF2B] font-medium border-l-2 border-[#EAFF2B]' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <route.icon className={`h-5 w-5 flex-shrink-0 transition-colors ${isActive ? 'text-[#EAFF2B]' : 'text-gray-500 group-hover:text-white'}`} />
                    {isOpen && <span className="text-sm">{route.name}</span>}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className={`my-3 ${isOpen ? 'border-t border-white/5' : 'w-8 h-px bg-white/10 mx-auto'}`} />

          {/* Hackathon Hub Section */}
          <div>
            {isOpen && (
              <div className="flex items-center gap-2 px-3 pb-2 mb-1">
                <Zap className="h-3 w-3 text-[#EAFF2B]/60 flex-shrink-0" />
                <span className="text-[10px] font-mono text-[#EAFF2B]/60 uppercase tracking-[0.2em]">Hackathon Hub</span>
              </div>
            )}
            {!isOpen && <div className="w-8 h-px bg-[#EAFF2B]/20 mx-auto mb-3" />}
            <div className="space-y-1">
              {hackathonRoutes.map((route) => {
                const isActive = pathname === route.href || pathname.startsWith(route.href + '/');
                return (
                  <Link
                    key={route.href}
                    href={route.href}
                    className={`group flex items-center gap-3 rounded-none px-3 py-3 transition-all ${
                      isActive ? 'bg-gradient-to-r from-[#EAFF2B]/10 to-transparent text-[#EAFF2B] font-medium border-l-2 border-[#EAFF2B]' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <route.icon className={`h-5 w-5 flex-shrink-0 transition-colors ${isActive ? 'text-[#EAFF2B]' : 'text-gray-500 group-hover:text-white'}`} />
                    {isOpen && <span className="text-sm">{route.name}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        {/* User section */}
        <div className="border-t border-white/5 px-3 py-4">
          <div className="flex items-center gap-3 rounded-none bg-white/5 p-3">
            {isOpen && (
              <>
                <img src={session?.user?.image || '/avatars/default.png'} alt="" className="h-10 w-10 rounded-sm border border-white/10 object-cover" />
                <div className="flex-1 overflow-hidden">
                  <p className="text-sm font-medium text-white truncate">{session?.user?.name || 'Admin User'}</p>
                  <p className="text-xs text-gray-500 truncate">{session?.user?.email || 'Admin'}</p>
                </div>
              </>
            )}
            {!isOpen && (
              <img src={session?.user?.image || '/avatars/default.png'} alt="" className="h-8 w-8 rounded-sm border border-white/10 object-cover" />
            )}
          </div>
          {isOpen && (
            <button onClick={() => signOut({ callbackUrl: '/login' })} className="mt-3 flex w-full items-center gap-3 rounded-none px-3 py-3 text-gray-500 hover:bg-red-500/10 hover:text-red-400 transition-colors">
              <LogOut className="h-5 w-5" />
              <span className="text-sm font-semibold">Log out</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
