'use client';

import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/portal/AdminLayout';
import { LiquidGlass } from '@/components/portal/LiquidGlass';
import { Users, Trophy, Calendar, Clock, TrendingUp, Activity } from 'lucide-react';

export default function AnalyticsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // TODO: Replace with actual trpc analytics.overview when implemented
  // const { data: stats, isLoading } = trpc.analytics.overview.useQuery(undefined, { enabled: !!session });
  const stats = { totalParticipants: 0, totalEvents: 0, totalHackathons: 0, checkinsToday: 0 };
  const isLoading = false;

  if (status === 'unauthenticated') {
    router.push('/login');
    return null;
  }

  const StatCard = ({ icon: Icon, title, value, subtitle, trend }: any) => (
    <LiquidGlass className="p-6 relative overflow-hidden group hover:border-white/20 transition-all duration-300">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.02] via-transparent to-emerald-500/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="absolute -top-20 -right-20 w-48 h-48 bg-accent/5 rounded-full blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative flex items-center gap-4">
        {/* Icon container with gradient */}
        <div className="group/icon relative flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-accent/20 to-emerald-600/10 text-white border border-white/10 group-hover/icon:scale-110 transition-transform duration-300">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-accent/30 to-emerald-500/20 opacity-0 group-hover/icon:opacity-100 transition-opacity duration-300" />
          <Icon className="h-7 w-7 relative z-10 group-hover/icon:text-white transition-colors" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-text-muted font-medium">{title}</p>
          <p className="text-3xl font-black text-white tracking-tight">{value}</p>
          {subtitle && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-text-muted font-mono">{subtitle}</span>
              {trend?.positive && (
                <span className="text-xs text-emerald-400 flex items-center gap-1 group-hover/icon:gap-2 transition-all">
                  <TrendingUp className="h-3 w-3 animate-in slide-in-from-bottom-2" />
                  {trend.percent}%
                </span>
              )}
              {trend?.negative && (
                <span className="text-xs text-red-400 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 rotate-180" />
                  {trend.percent}%
                </span>
              )}
            </div>
          )}
          {/* Decorative accent line */}
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>
      </div>
    </LiquidGlass>
  );

  return (
    <AdminLayout>
      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Ambient Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-15%] left-[-10%] w-[700px] h-[700px] bg-gradient-to-r from-accent/6 via-cyan-900/12 to-purple-900/10 blur-[350px] rounded-full" />
          <div className="absolute bottom-[-12%] right-[-8%] w-[600px] h-[600px] bg-gradient-to-r from-emerald-900/12 via-cyan-900/10 to-indigo-900/10 blur-[300px] rounded-full" />
        </div>

        {/* Page Header - Enhanced */}
        <div className="relative mb-8 p-6 border border-white/5 bg-gradient-to-br from-accent/8 via-cyan-900/10 to-transparent rounded-2xl overflow-hidden group hover:border-accent/40 transition-all duration-500">
          <div className="absolute inset-0 bg-gradient-to-r from-accent/5 via-transparent to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute -top-24 -right-24 w-56 h-56 bg-accent/10 rounded-full blur-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <h1 className="relative text-3xl font-black text-white tracking-tighter mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:via-cyan-100 to-gray-400 transition-all duration-500">
            Analytics <span className="text-accent italic">Dashboard</span>
          </h1>
          <p className="relative text-text-muted text-sm font-mono">
            View comprehensive statistics across all events, hackathons, and user engagement.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          {isLoading ? (
            [1, 2, 3, 4].map((i) => (
              <LiquidGlass key={i} className="p-6">
                <div className="animate-pulse space-y-3">
                  <div className="h-14 w-14 rounded-xl bg-white/5" />
                  <div className="h-4 w-24 bg-white/5 rounded" />
                  <div className="h-8 w-16 bg-white/5 rounded" />
                </div>
              </LiquidGlass>
            ))
          ) : (
            <>
              <StatCard
                icon={Users}
                title="Total Participants"
                value={stats?.totalParticipants || 0}
                subtitle="registered across all events"
                trend={{ positive: true, percent: 12 }}
              />
              <StatCard
                icon={Trophy}
                title="Events Hosted"
                value={stats?.totalEvents || 0}
                subtitle="competitions and gatherings"
                trend={{ positive: true, percent: 8 }}
              />
              <StatCard
                icon={Calendar}
                title="Hackathons"
                value={stats?.totalHackathons || 0}
                subtitle="active and upcoming"
                trend={{ positive: true, percent: 5 }}
              />
              <StatCard
                icon={TrendingUp}
                title="Check-ins Today"
                value={stats?.checkinsToday || 0}
                subtitle="scanned via QR codes"
                trend={{ positive: true, percent: 23 }}
              />
            </>
          )}
        </div>

        {/* Charts Section - Enhanced */}
        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          {/* Registration Trend */}
          <LiquidGlass className="p-6 relative overflow-hidden group hover:border-white/20 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.02] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <svg className="w-40 h-40 text-accent" viewBox="0 0 24 24" fill="currentColor"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            </div>
            <h2 className="text-lg font-bold text-white mb-4 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white to-gray-400 transition-all">
              Registration Trend
            </h2>
            <div className="relative h-64 bg-black/20 rounded-xl flex items-center justify-center border border-white/5 overflow-hidden">
              {/* Chart background decorations */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
              <p className="relative text-text-muted text-sm text-center z-10">Chart visualization for registration trends</p>
            </div>
          </LiquidGlass>

          {/* Event Types */}
          <LiquidGlass className="p-6 relative overflow-hidden group hover:border-white/20 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.02] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <svg className="w-36 h-36 text-emerald-500" viewBox="0 0 24 24" fill="currentColor"><path d="M19.5 12c0 1.232-.043 2.422-.134 3.573M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path d="M12 17.75V.188A2.02 2.02 0 009.99 0 4.02 4.02 0 005.97 2.01L4 12c0 4.17 2.96 7.7 7 9" /></svg>
            </div>
            <h2 className="text-lg font-bold text-white mb-4 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white to-gray-400 transition-all">
              Event Distribution
            </h2>
            <div className="relative h-64 bg-black/20 rounded-xl flex items-center justify-center border border-white/5 overflow-hidden">
              {/* Chart background decorations */}
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.02] to-transparent pointer-events-none" />
              <p className="relative text-text-muted text-sm text-center z-10">Pie chart for event type breakdown</p>
            </div>
          </LiquidGlass>
        </div>

        {/* Recent Activity - Enhanced */}
        <LiquidGlass className="p-6 relative overflow-hidden group hover:border-white/20 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.02] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <svg className="w-32 h-32 text-accent" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" /></svg>
          </div>
          <h2 className="text-lg font-bold text-white mb-4 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white to-gray-400 transition-all">
            Recent Activity
          </h2>
          <div className="space-y-3">
            {isLoading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-white/5 animate-pulse group-hover:bg-white/[0.08] transition-colors">
                  <div className="h-10 w-10 rounded-full bg-white/10 group-hover:bg-accent/10 transition-colors" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-white/10 rounded mb-2 group-hover:bg-accent/10 transition-colors" />
                    <div className="h-3 w-48 bg-white/5 rounded group-hover:bg-accent/5 transition-colors" />
                  </div>
                </div>
              ))
            ) : (
              <div className="text-text-muted text-sm text-center py-8 group-hover:text-gray-400 transition-colors">
                No recent activity to display
              </div>
            )}
          </div>
        </LiquidGlass>
      </div>
    </AdminLayout>
  );
}
