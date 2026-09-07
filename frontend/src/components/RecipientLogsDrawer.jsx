import React, { useState, useEffect } from 'react';
import { 
  X, Search, Mail, CheckCircle2, Clock, AlertTriangle, ShieldCheck, 
  RefreshCw, ExternalLink, Eye
} from 'lucide-react';

export default function RecipientLogsDrawer({
  isOpen,
  onClose,
  segment, // 'actioned' | 'pending'
  teamStats,
  onSelectCampaign,
  onSelectRecipient
}) {
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const isActioned = segment === 'actioned';
  const title = isActioned ? 'Actioned Logs' : 'Pending Action Logs';
  const badgeColor = isActioned ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20';

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch recipient logs whenever drawer opens or search term / segment changes
  useEffect(() => {
    if (!isOpen) return;

    const fetchRecipients = async () => {
      setLoading(true);
      setError(null);
      try {
        const queryParams = new URLSearchParams();
        if (segment) queryParams.set('status', segment);
        if (searchTerm.trim()) queryParams.set('search', searchTerm.trim());

        const res = await fetch(`/api/stats/recipients?${queryParams.toString()}`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        setRecipients(data.recipients || []);
      } catch (err) {
        console.error('Failed to fetch recipient logs:', err);
        setError(err.message || 'Failed to load recipient logs');
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(fetchRecipients, 200); // 200ms debounce for search
    return () => clearTimeout(timer);
  }, [isOpen, segment, searchTerm]);

  if (!isOpen) return null;

  // Segment count & percent matching donut data
  const segmentCount = isActioned ? teamStats?.total_actioned : teamStats?.total_pending;
  const segmentPercent = isActioned ? teamStats?.actioned_percent : teamStats?.pending_percent;

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

  const handleRowClick = (recipient) => {
    if (onSelectRecipient) {
      onSelectRecipient(recipient);
    }
    if (onSelectCampaign && recipient.campaign_id) {
      onSelectCampaign(recipient.campaign_id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-fade-in">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-3xl bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col">
          
          {/* Drawer Header */}
          <div className="p-6 border-b border-slate-800/80 bg-slate-950/40 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border ${badgeColor}`}>
                  {isActioned ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <Clock className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    <span>{title}</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeColor}`}>
                      {segmentCount ?? recipients.length} {isActioned ? 'Actioned' : 'Pending'} ({segmentPercent ?? 0}%)
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isActioned 
                      ? 'Recipients who have completed action (recorded reply)'
                      : 'Recipients awaiting response (email opens alone do not mark actioned)'}
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search by recipient name, email, or campaign..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 text-sm text-white placeholder-slate-500 rounded-xl pl-10 pr-10 py-2.5 outline-none transition-colors"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Drawer Body Table Content */}
          <div className="flex-1 overflow-y-auto p-6">
            
            {loading ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
                <span className="text-xs font-medium">Fetching {title.toLowerCase()}...</span>
              </div>
            ) : error ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-rose-400">
                <AlertTriangle className="w-8 h-8" />
                <span className="text-sm font-semibold">{error}</span>
                <button
                  onClick={() => setSearchTerm(searchTerm)}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : recipients.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center gap-2 text-slate-500">
                <Mail className="w-10 h-10 stroke-1 text-slate-600 mb-1" />
                <span className="text-sm font-semibold text-slate-400">No {isActioned ? 'actioned' : 'pending'} recipients found</span>
                <span className="text-xs text-slate-500">
                  {searchTerm ? 'Try adjusting your search query' : 'All recipient records match criteria'}
                </span>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Recipient</th>
                      <th className="py-3 px-4">Campaign</th>
                      <th className="py-3 px-4">Status</th>
                      {isActioned ? (
                        <>
                          <th className="py-3 px-4">Actioned Time</th>
                          <th className="py-3 px-4">Reply TAT</th>
                          <th className="py-3 px-4">Opens</th>
                        </>
                      ) : (
                        <>
                          <th className="py-3 px-4">Sent Time</th>
                          <th className="py-3 px-4">Waiting TAT</th>
                          <th className="py-3 px-4">SLA Status</th>
                          <th className="py-3 px-4">First Opened</th>
                        </>
                      )}
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">
                    {recipients.map((r) => (
                      <tr 
                        key={r.id}
                        onClick={() => handleRowClick(r)}
                        className="hover:bg-slate-800/60 transition-colors cursor-pointer group"
                      >
                        {/* Recipient Name & Email */}
                        <td className="py-3.5 px-4 font-medium">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-bold text-[11px] group-hover:border-sky-500 transition-colors">
                              {(r.name || r.email || '?')[0].toUpperCase()}
                            </div>
                            <div>
                              <div className="text-white font-semibold group-hover:text-sky-300 transition-colors">
                                {r.name || 'Unnamed Recipient'}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono">{r.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Campaign Subject */}
                        <td className="py-3.5 px-4">
                          <span className="text-slate-300 line-clamp-1 max-w-[160px]" title={r.campaign_subject}>
                            {r.campaign_subject || r.campaign_title || `Campaign #${r.campaign_id}`}
                          </span>
                        </td>

                        {/* Status Badge */}
                        <td className="py-3.5 px-4">
                          {r.status === 'REPLIED' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" /> Actioned
                            </span>
                          ) : r.status === 'OPENED' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                              <Eye className="w-3 h-3" /> Opened
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                              <Mail className="w-3 h-3" /> Sent
                            </span>
                          )}
                        </td>

                        {/* Actioned specific columns */}
                        {isActioned ? (
                          <>
                            <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                              {formatDate(r.first_replied_at)}
                            </td>
                            <td className="py-3.5 px-4 font-semibold text-emerald-400 font-mono">
                              {r.tat_reply_formatted || 'N/A'}
                            </td>
                            <td className="py-3.5 px-4 text-slate-400">
                              {r.open_count || 0}
                            </td>
                          </>
                        ) : (
                          <>
                            {/* Pending specific columns */}
                            <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                              {formatDate(r.sent_at)}
                            </td>
                            <td className="py-3.5 px-4 font-semibold text-amber-400 font-mono">
                              {r.waiting_tat_formatted || 'N/A'}
                            </td>
                            <td className="py-3.5 px-4">
                              {r.sla_status === 'BREACHED' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                  <AlertTriangle className="w-3 h-3" /> Breached
                                </span>
                              ) : r.sla_status === 'AT_RISK' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                  <Clock className="w-3 h-3" /> At Risk
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  <ShieldCheck className="w-3 h-3" /> On Track
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                              {r.first_opened_at ? formatDate(r.first_opened_at) : 'Not Opened'}
                            </td>
                          </>
                        )}

                        {/* External Link icon */}
                        <td className="py-3.5 px-4 text-right">
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500 group-hover:text-sky-400 transition-colors">
                            <span>View</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </span>
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>

          {/* Drawer Footer */}
          <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-500">
            <span>Showing {recipients.length} matching recipient logs</span>
            <span className="text-slate-400">Click any row to view full campaign detail</span>
          </div>

        </div>
      </div>
    </div>
  );
}
