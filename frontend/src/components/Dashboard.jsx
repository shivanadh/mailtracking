import React, { useState, useEffect } from 'react';
import { 
  Plus, Mail, Eye, MessageSquare, Clock, Zap, BarChart2, TrendingUp, 
  Settings, RefreshCw, ChevronRight, Trash2, Shield, Users 
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function Dashboard({ 
  campaigns, 
  loading, 
  onRefresh, 
  onSelectCampaign, 
  onOpenNewCampaignModal, 
  onOpenSettingsModal 
}) {
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch('/api/sync/replies', { method: 'POST' });
      await onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  // Compute overall global stats
  const totalCampaigns = campaigns.length;
  const totalRecipients = campaigns.reduce((acc, c) => acc + (c.total_recipients || 0), 0);
  const totalOpened = campaigns.reduce((acc, c) => acc + (c.opened_count || 0), 0);
  const totalReplied = campaigns.reduce((acc, c) => acc + (c.replied_count || 0), 0);

  const overallOpenRate = totalRecipients ? Math.round((totalOpened / totalRecipients) * 100) : 0;
  const overallReplyRate = totalRecipients ? Math.round((totalReplied / totalRecipients) * 100) : 0;

  // Chart data formatting
  const chartData = campaigns.slice(0, 10).reverse().map((c) => ({
    name: c.subject.length > 15 ? c.subject.substring(0, 15) + '...' : c.subject,
    Recipients: c.total_recipients,
    Opened: c.opened_count,
    Replied: c.replied_count
  }));

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Top Welcome & Quick Actions Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            MailPulse Group Tracking & TAT Console
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Gmail API Group Fan-out Engine with Per-Person Open & Reply Turnaround Time (TAT) Analytics
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSettingsModal}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 text-sm transition-all cursor-pointer"
          >
            <Settings className="w-4 h-4 text-slate-400" />
            <span>Settings</span>
          </button>

          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 text-sm transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin text-sky-400' : 'text-sky-400'}`} />
            <span>Sync Replies</span>
          </button>

          <button
            onClick={onOpenNewCampaignModal}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-sky-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Group Campaign</span>
          </button>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="glass-panel glass-panel-hover rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total Group Campaigns</span>
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400">
              <Mail className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white mt-3">{totalCampaigns}</div>
          <div className="text-xs text-slate-400 mt-1">
            <span className="text-sky-400 font-semibold">{totalRecipients}</span> total emails delivered
          </div>
        </div>

        <div className="glass-panel glass-panel-hover rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Overall Open Rate</span>
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400">
              <Eye className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-sky-400 mt-3">{overallOpenRate}%</div>
          <div className="text-xs text-slate-400 mt-1">
            <span className="text-white font-semibold">{totalOpened}</span> of {totalRecipients} opened
          </div>
        </div>

        <div className="glass-panel glass-panel-hover rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Overall Reply Rate</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 mt-3">{overallReplyRate}%</div>
          <div className="text-xs text-slate-400 mt-1">
            <span className="text-white font-semibold">{totalReplied}</span> responses tracked
          </div>
        </div>

        <div className="glass-panel glass-panel-hover rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>TAT Performance Engine</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg font-bold text-slate-200 mt-3 flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-amber-400" /> Active Real-time
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Open & Reply TAT auto-calculated
          </div>
        </div>

      </div>

      {/* Analytics Graph Section */}
      {chartData.length > 0 && (
        <div className="glass-panel rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-sky-400" />
                Campaign Engagement Trend
              </h3>
              <p className="text-xs text-slate-400">Recipients, Opens, and Replies across recent campaigns</p>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRecipients" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorOpened" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#0284c7" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorReplied" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.75rem', color: '#fff' }}
                />
                <Area type="monotone" dataKey="Recipients" stroke="#38bdf8" fillOpacity={1} fill="url(#colorRecipients)" />
                <Area type="monotone" dataKey="Opened" stroke="#0284c7" fillOpacity={1} fill="url(#colorOpened)" />
                <Area type="monotone" dataKey="Replied" stroke="#10b981" fillOpacity={1} fill="url(#colorReplied)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Campaigns List Table Container */}
      <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-800/80 bg-slate-900/40">
          <div>
            <h3 className="text-base font-semibold text-white">Group Mail Campaigns</h3>
            <p className="text-xs text-slate-400">Select a campaign to inspect individual recipient TAT and live tracking logs</p>
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Subject & Campaign</th>
                <th className="px-4 py-3.5 font-semibold">Sent Date</th>
                <th className="px-4 py-3.5 font-semibold text-center">Recipients</th>
                <th className="px-4 py-3.5 font-semibold text-center">Open Rate</th>
                <th className="px-4 py-3.5 font-semibold text-center">Reply Rate</th>
                <th className="px-4 py-3.5 font-semibold">Avg Open TAT</th>
                <th className="px-4 py-3.5 font-semibold">Avg Reply TAT</th>
                <th className="px-5 py-3.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Loading campaigns...
                  </td>
                </tr>
              ) : campaigns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center space-y-3">
                    <Mail className="w-10 h-10 text-slate-600 mx-auto" />
                    <p className="text-slate-400 text-sm">No group email campaigns created yet.</p>
                    <button
                      onClick={onOpenNewCampaignModal}
                      className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold rounded-xl"
                    >
                      Create First Group Campaign
                    </button>
                  </td>
                </tr>
              ) : (
                campaigns.map((c) => (
                  <tr 
                    key={c.id} 
                    onClick={() => onSelectCampaign(c.id)}
                    className="hover:bg-slate-900/60 transition-colors cursor-pointer group"
                  >
                    <td className="px-5 py-4">
                      <div className="font-semibold text-white group-hover:text-sky-400 transition-colors">{c.subject}</div>
                      {c.title && c.title !== c.subject && (
                        <div className="text-xs text-slate-400 mt-0.5">{c.title}</div>
                      )}
                    </td>

                    <td className="px-4 py-4 text-xs text-slate-400">
                      {new Date(c.sent_at).toLocaleDateString()} {new Date(c.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>

                    <td className="px-4 py-4 text-center font-medium text-white">
                      {c.total_recipients}
                    </td>

                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                        {c.open_rate}% ({c.opened_count})
                      </span>
                    </td>

                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {c.reply_rate}% ({c.replied_count})
                      </span>
                    </td>

                    <td className="px-4 py-4 text-xs font-semibold text-sky-300">
                      {c.avg_tat_open_formatted}
                    </td>

                    <td className="px-4 py-4 text-xs font-semibold text-emerald-300">
                      {c.avg_tat_reply_formatted}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center gap-1 text-sky-400 text-xs font-medium group-hover:translate-x-1 transition-transform">
                        <span>Inspect TAT</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
