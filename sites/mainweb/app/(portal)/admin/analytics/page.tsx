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
    <LiquidGlass className="p-6">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#00A8A8] to-emerald-600 text-white">
          <Icon className="h-7 w-7" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-text-muted">{title}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {subtitle && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-text-muted">{subtitle}</span>
              {trend?.positive && (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
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
        </div>
      </div>
    </LiquidGlass>
  );

  return (
    <AdminLayout>
      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="mb-8 p-5 border border-white/5 bg-gradient-to-br from-accent/5 to-transparent rounded-2xl">
          <h1 className="text-2xl font-black text-white tracking-tighter mb-2">
            Analytics <span className="text-accent italic">Dashboard</span>
          </h1>
          <p className="text-text-muted text-sm">
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

        {/* Charts Section */}
        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          {/* Registration Trend */}
          <LiquidGlass className="p-6">
            <h2 className="text-lg font-bold text-white mb-4">Registration Trend</h2>
            <div className="h-64 bg-black/20 rounded-xl flex items-center justify-center border border-white/5">
              <p className="text-text-muted text-sm text-center">Chart visualization for registration trends</p>
            </div>
          </LiquidGlass>

          {/* Event Types */}
          <LiquidGlass className="p-6">
            <h2 className="text-lg font-bold text-white mb-4">Event Distribution</h2>
            <div className="h-64 bg-black/20 rounded-xl flex items-center justify-center border border-white/5">
              <p className="text-text-muted text-sm text-center">Pie chart for event type breakdown</p>
            </div>
          </LiquidGlass>
        </div>

        {/* Recent Activity */}
        <LiquidGlass className="p-6">
          <h2 className="text-lg font-bold text-white mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {isLoading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-white/5 animate-pulse">
                  <div className="h-10 w-10 rounded-full bg-white/10" />
                  <div className="flex-1">
                    <div className="h-4 w-32 bg-white/10 rounded mb-2" />
                    <div className="h-3 w-48 bg-white/5 rounded" />
                  </div>
                </div>
              ))
            ) : (
              <div className="text-text-muted text-sm text-center py-8">
                No recent activity to display
              </div>
            )}
          </div>
        </LiquidGlass>
      </div>
    </AdminLayout>
  );
}
