import React, { useState, useEffect } from 'react';
import { 
  X, Search, Clock, CheckCircle2, AlertTriangle, ShieldCheck, 
  RefreshCw, ExternalLink, Calendar, Timer, Info, Award
} from 'lucide-react';

export default function TeamActionLogsDrawer({
  isOpen,
  onClose,
  initialTab = 'longest_pending',
  onSelectCampaign
}) {
  const [activeTab, setActiveTab] = useState(initialTab); // 'longest_pending' | 'most_actioned'
  const [dateRange, setDateRange] = useState('all_time'); // 'today' | 'last_7_days' | 'last_30_days' | 'all_time'
  const [searchTerm, setSearchTerm] = useState('');
  const [logs, setLogs] = useState([]);
  const [rankedSummary, setRankedSummary] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sync activeTab when initialTab changes on drawer open
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Handle Escape key to close drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch team action logs
  const fetchLogs = async () => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams();
      queryParams.set('tab', activeTab);
      queryParams.set('dateRange', dateRange);
      if (searchTerm.trim()) queryParams.set('search', searchTerm.trim());

      const res = await fetch(`/api/stats/team-action-logs?${queryParams.toString()}`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();

      setLogs(data.logs || []);
      setTotalCount(data.total_count || 0);
      setRankedSummary(data.ranked_summary || []);
    } catch (err) {
      console.error('Failed to fetch team action logs:', err);
      setError(err.message || 'Failed to load team action logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLogs();
    }, 200); // 200ms debounce for search
    return () => clearTimeout(timer);
  }, [isOpen, activeTab, dateRange, searchTerm]);

  if (!isOpen) return null;

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-fade-in">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6">
        <div className="w-screen max-w-4xl bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col">
          
          {/* Drawer Header */}
          <div className="p-6 border-b border-slate-800 bg-slate-900/90 backdrop-blur flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
                <Timer className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white tracking-tight">Team Action Logs</h2>
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    {totalCount} Record{totalCount === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Detailed drill-down for pending turnaround times and actioned recipient logs
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Tab Selector */}
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setActiveTab('longest_pending')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'longest_pending'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Longest Pending</span>
                </button>

                <button
                  onClick={() => setActiveTab('most_actioned')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'most_actioned'
                      ? 'bg-emerald-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Most Actioned</span>
                </button>
              </div>

              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Mandatory Helper Message Banner */}
          <div className="px-6 py-2.5 bg-sky-950/40 border-b border-sky-500/20 text-xs text-sky-300 flex items-center gap-2 font-medium">
            <Info className="w-4 h-4 text-sky-400 shrink-0" />
            <span>Actioned means a tracked reply/action; an email open alone remains pending.</span>
          </div>

          {/* Search & Filter Controls Bar */}
          <div className="p-4 border-b border-slate-800/80 bg-slate-950/40 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-[240px]">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by recipient name, email, or campaign..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Date Range Selector */}
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className="bg-transparent text-xs text-white font-medium focus:outline-none cursor-pointer"
                >
                  <option value="all_time" className="bg-slate-900">All Time</option>
                  <option value="today" className="bg-slate-900">Today</option>
                  <option value="last_7_days" className="bg-slate-900">Last 7 Days</option>
                  <option value="last_30_days" className="bg-slate-900">Last 30 Days</option>
                </select>
              </div>

              <button
                onClick={fetchLogs}
                disabled={loading}
                className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
                title="Refresh logs"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {/* Top Ranked Summary (Only on Most Actioned Tab) */}
            {activeTab === 'most_actioned' && rankedSummary.length > 0 && !loading && (
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                  <Award className="w-4 h-4 text-emerald-400" />
                  Top Actioned Recipient Contacts Ranked
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {rankedSummary.slice(0, 6).map((rank, idx) => (
                    <div 
                      key={rank.email}
                      className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0">
                          #{idx + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-xs text-white truncate">
                            {rank.name}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {rank.email}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-extrabold text-emerald-400">
                          {rank.actioned_count} Actioned
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Avg: {rank.avg_reply_tat_formatted}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Table & States */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
                <span className="text-xs font-medium">Loading {activeTab === 'longest_pending' ? 'pending' : 'actioned'} logs...</span>
              </div>
            ) : error ? (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            ) : logs.length === 0 ? (
              <div className="p-12 text-center bg-slate-950/40 rounded-2xl border border-slate-800/60 space-y-2">
                <Clock className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-sm font-semibold text-white">No Matching Recipient Records Found</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {searchTerm || dateRange !== 'all_time'
                    ? 'No records match your active search and date range filters.'
                    : activeTab === 'longest_pending'
                    ? 'All recipients have completed actions! No pending items currently.'
                    : 'No actioned/replied email logs recorded yet.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">
                <table className="w-full text-left text-xs text-slate-300 border-collapse min-w-[700px]">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px] bg-slate-900/80">
                      <th className="py-3 px-4 font-semibold">Recipient Contact</th>
                      <th className="py-3 px-4 font-semibold">Campaign</th>
                      <th className="py-3 px-4 font-semibold text-center">Status</th>
                      {activeTab === 'longest_pending' ? (
                        <>
                          <th className="py-3 px-4 font-semibold text-center">Sent Time</th>
                          <th className="py-3 px-4 font-semibold text-center">Pending TAT</th>
                          <th className="py-3 px-4 font-semibold text-center">SLA Status</th>
                          <th className="py-3 px-4 font-semibold text-center">First Opened</th>
                        </>
                      ) : (
                        <>
                          <th className="py-3 px-4 font-semibold text-center">Actioned Time</th>
                          <th className="py-3 px-4 font-semibold text-center">Action TAT</th>
                          <th className="py-3 px-4 font-semibold text-center">First Opened</th>
                          <th className="py-3 px-4 font-semibold text-center">Open Count</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {logs.map((log) => {
                      const isBreached = log.sla_status === 'BREACHED';
                      const isAtRisk = log.sla_status === 'AT_RISK';

                      return (
                        <tr
                          key={log.id}
                          onClick={() => {
                            if (onSelectCampaign && log.campaign_id) {
                              onSelectCampaign(log.campaign_id);
                              onClose();
                            }
                          }}
                          className="hover:bg-slate-800/50 transition-colors cursor-pointer group"
                        >
                          {/* Recipient */}
                          <td className="py-3.5 px-4 font-medium text-white">
                            <div className="font-semibold text-slate-100 group-hover:text-sky-400 transition-colors">
                              {log.name || log.email.split('@')[0]}
                            </div>
                            <div className="text-[11px] text-slate-400 font-normal">
                              {log.email}
                            </div>
                          </td>

                          {/* Campaign */}
                          <td className="py-3.5 px-4 text-slate-300">
                            <div className="font-medium text-slate-200 truncate max-w-[180px]">
                              {log.campaign_subject || 'Untitled Campaign'}
                            </div>
                            <div className="text-[10px] text-sky-400 flex items-center gap-1 group-hover:underline">
                              <span>View Campaign</span>
                              <ExternalLink className="w-3 h-3" />
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4 text-center">
                            {log.status === 'REPLIED' ? (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Actioned
                              </span>
                            ) : log.status === 'OPENED' ? (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20 inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Opened (Pending)
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Sent (Pending)
                              </span>
                            )}
                          </td>

                          {/* Tab specific columns */}
                          {activeTab === 'longest_pending' ? (
                            <>
                              {/* Sent Time */}
                              <td className="py-3.5 px-4 text-center text-slate-400 text-[11px]">
                                {formatDate(log.sent_at)}
                              </td>

                              {/* Pending TAT */}
                              <td className="py-3.5 px-4 text-center font-mono">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs ${
                                  isBreached
                                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold'
                                    : isAtRisk
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold'
                                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                                }`}>
                                  <Timer className="w-3.5 h-3.5" />
                                  {log.waiting_tat_formatted}
                                </span>
                              </td>

                              {/* SLA Status */}
                              <td className="py-3.5 px-4 text-center">
                                {isBreached ? (
                                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 inline-flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> Breached (&gt;48h)
                                  </span>
                                ) : isAtRisk ? (
                                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 inline-flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> At Risk (24-48h)
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3" /> On Track (&lt;24h)
                                  </span>
                                )}
                              </td>

                              {/* First Opened */}
                              <td className="py-3.5 px-4 text-center text-slate-400 text-[11px]">
                                {log.first_opened_at ? formatDate(log.first_opened_at) : <span className="text-slate-600">Not opened</span>}
                              </td>
                            </>
                          ) : (
                            <>
                              {/* Actioned Time */}
                              <td className="py-3.5 px-4 text-center text-emerald-400 text-[11px] font-medium">
                                {formatDate(log.first_replied_at)}
                              </td>

                              {/* Action TAT */}
                              <td className="py-3.5 px-4 text-center font-mono">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                                  <Timer className="w-3.5 h-3.5" />
                                  {log.tat_reply_formatted || 'N/A'}
                                </span>
                              </td>

                              {/* First Opened */}
                              <td className="py-3.5 px-4 text-center text-slate-400 text-[11px]">
                                {log.first_opened_at ? formatDate(log.first_opened_at) : <span className="text-slate-600">Direct reply</span>}
                              </td>

                              {/* Open Count */}
                              <td className="py-3.5 px-4 text-center font-mono text-slate-300">
                                {log.open_count || 0}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

          </div>

          {/* Drawer Footer */}
          <div className="p-4 border-t border-slate-800 bg-slate-950/60 text-xs text-slate-400 flex items-center justify-between">
            <span>Showing {logs.length} recipient log{logs.length === 1 ? '' : 's'} ({activeTab === 'longest_pending' ? 'Pending' : 'Actioned'})</span>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
            >
              Close Drawer
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
