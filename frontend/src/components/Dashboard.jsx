import React, { useState, useEffect } from 'react';
import { 
  Plus, Mail, Eye, MessageSquare, Clock, Zap, BarChart2, TrendingUp, 
  Settings, RefreshCw, ChevronRight, Trash2, Shield, Users,
  PieChart as PieChartIcon, CheckCircle2, ShieldCheck, BarChart3, Timer
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';

export default function Dashboard({ 
  campaigns, 
  loading, 
  onRefresh, 
  onSelectCampaign, 
  onOpenNewCampaignModal, 
  onOpenSettingsModal 
}) {
  const [syncing, setSyncing] = useState(false);
  const [teamStats, setTeamStats] = useState(null);

  useEffect(() => {
    fetchTeamStats();
  }, [campaigns]);

  const fetchTeamStats = async () => {
    try {
      const res = await fetch('/api/stats/team');
      if (res.ok) {
        const data = await res.json();
        setTeamStats(data);
      }
    } catch (err) {
      console.error('Failed fetching team stats:', err);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch('/api/sync/replies', { method: 'POST' });
      await onRefresh();
      await fetchTeamStats();
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

  // Donut chart dataset for Received vs Actioned vs Pending
  const donutData = teamStats ? [
    { name: 'Actioned', value: teamStats.total_actioned, color: '#10b981' },
    { name: 'Pending', value: teamStats.total_pending, color: '#f59e0b' }
  ] : [];

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

      {/* Team Overall Stats / Received Vs Actioned Banner */}
      <div className="glass-panel rounded-2xl p-6 border border-slate-800 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-950/80 shadow-2xl relative overflow-hidden">
        {/* Background glow accent */}
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Banner Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/80 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <PieChartIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>Team Overall Stats</span>
                <span className="text-xs font-normal text-slate-400">|</span>
                <span className="text-sky-400 font-semibold text-sm">Received vs Actioned</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time team workload dispatch, resolution rates, & TAT benchmark performance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              SLA Benchmark: 48 Hours
            </span>
          </div>
        </div>

        {/* Banner Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          
          {/* Donut Chart Column (4 cols) */}
          <div className="lg:col-span-4 bg-slate-950/60 rounded-2xl p-4 border border-slate-800/80 flex flex-col items-center justify-center relative min-h-[220px]">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-sky-400" /> Actioned Ratio Donut
            </div>

            {teamStats && teamStats.total_received > 0 ? (
              <div className="relative w-full h-44 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={75}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {donutData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', color: '#fff', fontSize: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                
                {/* Center text inside Donut */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-extrabold text-white">{teamStats.actioned_percent}%</span>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Actioned</span>
                </div>
              </div>
            ) : (
              <div className="h-44 flex items-center justify-center text-xs text-slate-500">
                No email data yet
              </div>
            )}

            {/* Donut Legend */}
            <div className="flex items-center gap-4 text-xs font-medium mt-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-slate-300">Actioned ({teamStats?.total_actioned || 0})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-slate-300">Pending ({teamStats?.total_pending || 0})</span>
              </div>
            </div>
          </div>

          {/* Metrics 6-Grid Column (8 cols) */}
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            
            {/* 1. Total e-mails received */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase">
                <span>1. Total Received</span>
                <Mail className="w-4 h-4 text-sky-400" />
              </div>
              <div className="text-2xl font-extrabold text-white mt-2">
                {teamStats?.total_received || 0}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Total delivered emails
              </div>
            </div>

            {/* 2. Total e-mails actioned */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase">
                <span>2. Total Actioned</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-extrabold text-emerald-400 mt-2 flex items-baseline gap-2">
                <span>{teamStats?.total_actioned || 0}</span>
                <span className="text-xs font-semibold text-emerald-500/90">
                  ({teamStats?.actioned_percent || 0}%)
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Responses logged
              </div>
            </div>

            {/* 3. Total e-mails pending */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase">
                <span>3. Total Pending</span>
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-extrabold text-amber-400 mt-2 flex items-baseline gap-2">
                <span>{teamStats?.total_pending || 0}</span>
                <span className="text-xs font-semibold text-amber-500/90">
                  ({teamStats?.pending_percent || 0}%)
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Awaiting response
              </div>
            </div>

            {/* 4. Avg TAT – On Actioned e-mails */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase">
                <span>4. Avg Actioned TAT</span>
                <Timer className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-emerald-300 mt-2">
                {teamStats?.avg_tat_actioned_formatted || 'N/A'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Avg TAT on actioned emails
              </div>
            </div>

            {/* 5. Avg TAT – On Pending e-mails */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase">
                <span>5. Avg Pending TAT</span>
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-xl font-bold text-amber-300 mt-2">
                {teamStats?.avg_tat_pending_formatted || 'N/A'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Avg TAT on pending emails
              </div>
            </div>

            {/* 6. TAT SLA Target Benchmark (48 Hours) */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase">
                <span>6. TAT Target</span>
                <ShieldCheck className="w-4 h-4 text-sky-400" />
              </div>
              <div className="text-xl font-bold text-sky-300 mt-2">
                48 Hours Target
              </div>
              <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                <span>SLA Rate:</span>
                <span className="font-semibold text-emerald-400">{teamStats?.sla_compliance_rate || 100}%</span>
              </div>
            </div>

          </div>

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
