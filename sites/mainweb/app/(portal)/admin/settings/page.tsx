'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Settings, Save, Shield, Database, Users, Bell, Globe, Key, Clock, Server } from 'lucide-react';
import { useSession } from 'next-auth/react';

export default function AdminSettingsPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<'general' | 'security' | 'integrations'>('general');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Mock settings state for UI demonstration
  const [settings, setSettings] = useState({
    systemName: 'DSGT Query Engine',
    maintenanceMode: false,
    requireEmailVerification: true,
    maxEventCapacity: 500,
    allowPublicRegistration: true,
  });

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }, 800);
  };

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight uppercase italic flex items-center gap-3">
            <Settings className="w-8 h-8 text-[#00A8A8]" />
            System Settings
          </h1>
          <p className="text-gray-400 mt-2 font-mono text-sm tracking-wide">
            Manage global portal configuration and security policies
          </p>
        </div>
        
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="group relative flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#00A8A8] to-emerald-600 rounded-xl text-white font-bold tracking-wide transition-all hover:scale-105 active:scale-95 disabled:opacity-50 overflow-hidden shadow-[0_0_20px_rgba(0,168,168,0.3)] hover:shadow-[0_0_30px_rgba(0,168,168,0.5)]"
        >
          <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          {isSaving ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : saved ? (
            <span className="flex items-center gap-2">
              <Shield className="w-5 h-5" /> Saved!
            </span>
          ) : (
            <span className="flex items-center gap-2 relative z-10">
              <Save className="w-5 h-5" /> Save Changes
            </span>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Tabs */}
        <div className="lg:col-span-1 space-y-2">
          {[
            { id: 'general', icon: Globe, label: 'General Configuration', desc: 'Basic system settings' },
            { id: 'security', icon: Shield, label: 'Security & Access', desc: 'Authentication policies' },
            { id: 'integrations', icon: Database, label: 'Integrations', desc: 'External API connections' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`w-full flex flex-col items-start p-4 rounded-xl transition-all duration-300 ${
                activeTab === tab.id
                  ? 'bg-[#00A8A8]/10 border border-[#00A8A8]/30 shadow-[0_0_15px_rgba(0,168,168,0.15)]'
                  : 'bg-white/5 border border-transparent hover:bg-white/10'
              }`}
            >
              <div className="flex items-center gap-3 w-full">
                <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-[#00A8A8]' : 'text-gray-400'}`} />
                <span className={`font-bold ${activeTab === tab.id ? 'text-white' : 'text-gray-300'}`}>
                  {tab.label}
                </span>
              </div>
              <span className="text-xs text-gray-500 mt-2 font-mono ml-8">{tab.desc}</span>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="lg:col-span-3">
          <div className="bg-[#0f1115] border border-white/5 rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-2xl">
            {/* Decorative background glow */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-[#00A8A8]/5 rounded-full blur-[100px] pointer-events-none" />

            {activeTab === 'general' && (
              <div className="space-y-8 relative z-10 animate-in fade-in duration-300">
                <h3 className="text-xl font-bold text-white flex items-center gap-2 border-b border-white/5 pb-4">
                  <Server className="w-5 h-5 text-[#00A8A8]" />
                  System Defaults
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-gray-400 uppercase tracking-widest">Portal Name</label>
                    <input
                      type="text"
                      value={settings.systemName}
                      onChange={(e) => setSettings({ ...settings, systemName: e.target.value })}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00A8A8] focus:ring-1 focus:ring-[#00A8A8] transition-all"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-gray-400 uppercase tracking-widest">Max Global Event Capacity</label>
                    <input
                      type="number"
                      value={settings.maxEventCapacity}
                      onChange={(e) => setSettings({ ...settings, maxEventCapacity: parseInt(e.target.value) || 0 })}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00A8A8] focus:ring-1 focus:ring-[#00A8A8] transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-black/30 border border-white/5">
                    <div>
                      <h4 className="text-white font-medium">Maintenance Mode</h4>
                      <p className="text-sm text-gray-500 mt-1">Disables access for non-admin users across the platform.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={settings.maintenanceMode}
                        onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00A8A8]"></div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-8 relative z-10 animate-in fade-in duration-300">
                <h3 className="text-xl font-bold text-white flex items-center gap-2 border-b border-white/5 pb-4">
                  <Key className="w-5 h-5 text-emerald-500" />
                  Security Policies
                </h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-black/30 border border-white/5 transition-colors hover:border-emerald-500/30">
                    <div className="flex gap-4 items-start">
                      <div className="mt-1 p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-white font-medium">Require Email Verification</h4>
                        <p className="text-sm text-gray-500 mt-1">Users must verify their email address before accessing club features.</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={settings.requireEmailVerification}
                        onChange={(e) => setSettings({ ...settings, requireEmailVerification: e.target.checked })}
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-xl bg-black/30 border border-white/5 transition-colors hover:border-emerald-500/30">
                    <div className="flex gap-4 items-start">
                      <div className="mt-1 p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                        <Globe className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-white font-medium">Public Registration</h4>
                        <p className="text-sm text-gray-500 mt-1">Allow new users to sign up without an admin invite.</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={settings.allowPublicRegistration}
                        onChange={(e) => setSettings({ ...settings, allowPublicRegistration: e.target.checked })}
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'integrations' && (
              <div className="space-y-8 relative z-10 animate-in fade-in duration-300">
                <h3 className="text-xl font-bold text-white flex items-center gap-2 border-b border-white/5 pb-4">
                  <Database className="w-5 h-5 text-purple-500" />
                  Connected Services
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-5 rounded-xl bg-black/30 border border-purple-500/20 hover:border-purple-500/50 transition-all group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400 group-hover:scale-110 transition-transform">
                        <Bell className="w-6 h-6" />
                      </div>
                      <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-green-400 bg-green-400/10 rounded-md">Connected</span>
                    </div>
                    <h4 className="text-white font-bold mb-1">Email Service</h4>
                    <p className="text-xs text-gray-500 mb-4">SMTP configuration for automated notifications and invites.</p>
                    <button className="text-xs font-bold text-purple-400 hover:text-purple-300">Configure Settings &rarr;</button>
                  </div>

                  <div className="p-5 rounded-xl bg-black/30 border border-white/5 hover:border-white/20 transition-all group opacity-50 grayscale hover:grayscale-0 hover:opacity-100">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400 group-hover:scale-110 transition-transform">
                        <Globe className="w-6 h-6" />
                      </div>
                      <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-400/10 rounded-md">Not Configured</span>
                    </div>
                    <h4 className="text-white font-bold mb-1">Discord Bot</h4>
                    <p className="text-xs text-gray-500 mb-4">Sync roles and announce events to Discord server.</p>
                    <button className="text-xs font-bold text-blue-400 hover:text-blue-300">Setup Connection &rarr;</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
