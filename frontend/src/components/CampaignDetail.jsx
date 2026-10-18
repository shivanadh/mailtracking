import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, RefreshCw, Eye, MessageSquare, Clock, CheckCircle2, 
  Mail, History, Globe, Shield, Sparkles, Filter, Trash2, ChevronRight, AlertTriangle, Zap 
} from 'lucide-react';
import ReplyDrawer from './ReplyDrawer';
import { DepartmentBadge, AssignmentBadge } from './DepartmentManager';

function formatDateTime(val, fallback = 'Not available') {
  if (!val) return fallback;
  const d = new Date(val);
  if (isNaN(d.getTime())) return fallback;
  return d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

function formatTime(val, fallback = 'Not available') {
  if (!val) return fallback;
  const d = new Date(val);
  if (isNaN(d.getTime())) return fallback;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function CampaignDetail({ campaignId, onBack, onDeleteCampaign }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  
  // Modals state
  const [timelineRecipient, setTimelineRecipient] = useState(null); // recipient object or null
  const [timelineLogs, setTimelineLogs] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const [activeReplyRecipientId, setActiveReplyRecipientId] = useState(null);

  const fetchCampaignDetail = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (!res.ok) {
        let errMsg = `Failed to load campaign details (${res.status})`;
        try {
          const errData = await res.json();
          if (errData && errData.error) errMsg = errData.error;
        } catch (_) {}
        throw new Error(errMsg);
      }
      const campaignData = await res.json();
      setData(campaignData);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCampaignDetail();
    // Auto polling every 15s for live updates
    const interval = setInterval(() => fetchCampaignDetail(), 15000);
    return () => clearInterval(interval);
  }, [campaignId]);

  const handleSyncReplies = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/sync/replies', { method: 'POST' });
      await fetchCampaignDetail();
    } catch (err) {
      console.error('Error syncing replies:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleExport = () => {
    window.open(`/api/campaigns/${campaignId}/export`, '_blank');
  };

  const handleUpdateStatus = async (status) => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('Failed to update status');
      await fetchCampaignDetail();
    } catch (err) {
      console.error(err);
    } finally {
      setRefreshing(false);
    }
  };

  const openTimeline = async (recipient) => {
    setTimelineRecipient(recipient);
    setLoadingTimeline(true);
    try {
      const res = await fetch(`/api/recipients/${recipient.id}/logs`);
      const logData = await res.json();
      setTimelineLogs(logData.logs || []);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoadingTimeline(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading campaign analytics & recipient TAT...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center bg-slate-900/60 rounded-2xl border border-slate-800 my-8 space-y-4">
        <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
        <div>
          <h3 className="text-base font-semibold text-white">Campaign Details Unavailable</h3>
          <p className="text-red-400 text-sm mt-1">{error || 'Campaign not found'}</p>
        </div>
        <button onClick={onBack} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm rounded-xl transition-colors cursor-pointer">
          Return to Campaigns List
        </button>
      </div>
    );
  }

  const metrics = data?.metrics || {};
  const recipients = Array.isArray(data?.recipients) ? data.recipients : [];
  const filteredRecipients = recipients.filter(r => {
    if (statusFilter === 'ALL') return true;
    return r.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      
      {/* Top Back & Header Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 text-sm transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Campaigns</span>
        </button>

        <div className="flex items-center gap-2.5">
          {(data.campaign_status === 'scheduled' || data.campaign_status === 'paused') && (
             <>
               {data.campaign_status === 'scheduled' ? (
                 <button onClick={() => handleUpdateStatus('paused')} disabled={refreshing} className="px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl text-sm transition-colors">Pause</button>
               ) : (
                 <button onClick={() => handleUpdateStatus('scheduled')} disabled={refreshing} className="px-3.5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-sm transition-colors">Resume</button>
               )}
               <button onClick={() => handleUpdateStatus('cancelled')} disabled={refreshing} className="px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-sm transition-colors">Cancel</button>
             </>
          )}

          <button
            onClick={() => fetchCampaignDetail(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 text-sm transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-sky-400' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleSyncReplies}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-xl text-sm font-medium transition-all cursor-pointer"
          >
            <Zap className="w-4 h-4 text-sky-400" />
            <span>Sync Gmail Replies</span>
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-sm font-medium transition-all cursor-pointer"
            title="Download Campaign Report"
          >
            <History className="w-4 h-4" /> {/* Or Download icon */}
            <span>Export Report</span>
          </button>

          <button
            onClick={() => onDeleteCampaign(data.id)}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
            title="Delete Campaign"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Campaign Overview Banner */}
      <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-sky-500/5 rounded-full filter blur-3xl pointer-events-none" />
        
        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <span className="px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  Campaign #{data.id}
                </span>
                <span className="text-xs text-slate-400">
                  {data.campaign_status === 'scheduled' || data.campaign_status === 'paused'
                     ? `Scheduled: ${formatDateTime(data.schedule_at, 'Not scheduled')}`
                     : data.campaign_status === 'cancelled'
                     ? 'Cancelled'
                     : data.campaign_status === 'failed'
                     ? 'Sending failed (Not sent)'
                     : data.sent_at
                     ? `Sent: ${formatDateTime(data.sent_at)}`
                     : 'Not sent yet'}
                </span>
                {data.campaign_status && data.campaign_status !== 'sent' && (
                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${
                    data.campaign_status === 'scheduled' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                    data.campaign_status === 'paused' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                    data.campaign_status === 'cancelled' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                    'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                  }`}>
                    {data.campaign_status}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">{data.subject}</h1>
              {data.title && data.title !== data.subject && (
                <p className="text-sm text-slate-400 mt-0.5">{data.title}</p>
              )}
              {data.departments && data.departments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {data.departments.map(d => (
                    <DepartmentBadge key={d.id} name={d.name} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 pt-2">
            
            <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3.5">
              <div className="text-xs text-slate-400 font-medium">Recipients</div>
              <div className="text-xl font-bold text-white mt-1">{metrics.total_recipients ?? 0}</div>
              <div className="text-[11px] text-slate-500">Group Mail Fan-out</div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3.5">
              <div className="text-xs text-sky-400 font-medium flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" /> Tracked Opens
              </div>
              <div className="text-xl font-bold text-white mt-1">{metrics.opened_count ?? 0} <span className="text-xs text-slate-400 font-normal">({metrics.open_rate ?? 0}%)</span></div>
              <div className="text-[11px] text-slate-500">Unique Tracked Opens</div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3.5">
              <div className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5" /> Replied
              </div>
              <div className="text-xl font-bold text-white mt-1">{metrics.replied_count ?? 0} <span className="text-xs text-slate-400 font-normal">({metrics.reply_rate ?? 0}%)</span></div>
              <div className="text-[11px] text-slate-500">Total Replies</div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3.5">
              <div className="text-xs text-purple-400 font-medium flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Avg Open TAT
              </div>
              <div className="text-lg font-bold text-sky-300 mt-1">
                {metrics.avg_tat_open_formatted && metrics.avg_tat_open_formatted !== 'N/A'
                  ? metrics.avg_tat_open_formatted
                  : 'Not available'}
              </div>
              <div className="text-[11px] text-slate-500">Time to First Tracked Open</div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3.5">
              <div className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Avg Reply TAT
              </div>
              <div className="text-lg font-bold text-emerald-300 mt-1">
                {metrics.avg_tat_reply_formatted && metrics.avg_tat_reply_formatted !== 'N/A'
                  ? metrics.avg_tat_reply_formatted
                  : 'Not available'}
              </div>
              <div className="text-[11px] text-slate-500">Time to Response</div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3.5">
              <div className="text-xs text-slate-400 font-medium">Tracking Mode</div>
              <div className="text-sm font-semibold text-slate-200 mt-1.5 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-sky-400" /> Pixel + Header
              </div>
              <div className="text-[11px] text-slate-500">Active Monitoring</div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3.5">
              <div className="text-xs text-amber-400 font-medium flex items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5" /> Follow-up
              </div>
              <div className="text-sm font-semibold text-slate-200 mt-1.5 flex items-center gap-1">
                {data.followup_enabled ? `Active (${data.followup_days} days)` : 'Disabled'}
              </div>
              <div className="text-[11px] text-slate-500">Auto-Responder</div>
            </div>

          </div>
        </div>
      </div>

      {/* Recipient Tracking Table Container */}
      <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
        
        {/* Table Header & Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-5 border-b border-slate-800/80 bg-slate-900/40">
          <div>
            <h3 className="text-base font-semibold text-white">Recipient Performance & TAT Log</h3>
            <p className="text-xs text-slate-400">Detailed per-person open status, reply status, and TAT turnaround metrics</p>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
              {['ALL', 'SENT', 'OPENED', 'REPLIED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    statusFilter === st
                      ? 'bg-sky-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Recipient Table */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800/80">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Recipient</th>
                <th className="px-4 py-3.5 font-semibold">Status</th>
                <th className="px-4 py-3.5 font-semibold">First Tracked Open & TAT</th>
                <th className="px-4 py-3.5 font-semibold">First Reply & TAT</th>
                <th className="px-4 py-3.5 font-semibold text-center">Tracked Opens</th>
                <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredRecipients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 text-sm">
                    {recipients.length === 0
                      ? 'No recipients registered for this campaign.'
                      : `No recipients found matching status filter "${statusFilter}".`}
                  </td>
                </tr>
              ) : (
                filteredRecipients.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-900/50 transition-colors group">
                    
                    {/* Recipient Info */}
                    <td className="px-5 py-4">
                      <div className="font-medium text-white">{rec.name || 'Recipient'}</div>
                      <div className="text-xs text-slate-400 font-mono">{rec.email}</div>
                      {(rec.department_name || rec.assignment_source) && (
                        <div className="flex items-center gap-1.5 mt-1">
                          {rec.department_name && <DepartmentBadge name={rec.department_name} small />}
                          {rec.assignment_source && <AssignmentBadge source={rec.assignment_source} small />}
                        </div>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="px-4 py-4">
                      {rec.status === 'REPLIED' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Replied
                        </span>
                      ) : rec.status === 'OPENED' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
                          <Eye className="w-3.5 h-3.5" /> Opened
                        </span>
                      ) : rec.status === 'FAILED' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                          <AlertTriangle className="w-3.5 h-3.5" /> Failed
                        </span>
                      ) : rec.status === 'SCHEDULED' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Clock className="w-3.5 h-3.5" /> Scheduled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Mail className="w-3.5 h-3.5" /> {rec.sent_at ? 'Pending' : 'Not sent yet'}
                        </span>
                      )}
                    </td>

                    {/* Open Info & TAT Open */}
                    <td className="px-4 py-4">
                      {rec.first_opened_at ? (
                        <div>
                          <div className="text-xs font-semibold text-sky-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> TAT: {rec.tat_open_formatted && rec.tat_open_formatted !== 'N/A' ? rec.tat_open_formatted : 'Not available'}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {formatTime(rec.first_opened_at)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500 italic">
                          {!rec.sent_at ? 'Not sent yet' : 'No tracked open'}
                        </span>
                      )}
                    </td>

                    {/* Reply Info & TAT Reply */}
                    <td className="px-4 py-4">
                      {rec.first_replied_at ? (
                        <div>
                          <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> TAT: {rec.tat_reply_formatted && rec.tat_reply_formatted !== 'N/A' ? rec.tat_reply_formatted : 'Not available'}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[180px]" title={rec.reply_snippet || ''}>
                            "{rec.reply_snippet || 'Reply received'}"
                          </div>
                          <button
                            onClick={() => setActiveReplyRecipientId(rec.id)}
                            className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                          >
                            <MessageSquare className="w-3 h-3" /> View Reply
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500 italic">
                          {!rec.sent_at ? 'Not sent yet' : 'No reply yet'}
                        </span>
                      )}
                    </td>

                    {/* Open Count */}
                    <td className="px-4 py-4 text-center">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                        {rec.open_count ?? 0}
                      </span>
                    </td>

                    {/* Action Buttons */}
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* View Reply Button if replied */}
                        {rec.status === 'REPLIED' && (
                          <button
                            onClick={() => setActiveReplyRecipientId(rec.id)}
                            className="px-2.5 py-1 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-lg border border-emerald-500/30 transition-all flex items-center gap-1 cursor-pointer font-medium"
                            title="View Recipient Reply Message"
                          >
                            <MessageSquare className="w-3 h-3 text-emerald-400" />
                            <span>View Reply</span>
                          </button>
                        )}

                        {/* View Logs Button */}
                        <button
                          onClick={() => openTimeline(rec)}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                          title="View Recipient Tracking Timeline"
                        >
                          <History className="w-4 h-4" />
                        </button>
                      </div>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* Recipient Event Timeline Drawer / Modal */}
      {timelineRecipient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#111827] border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-fade-in">
            
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
              <div className="flex items-center gap-2.5">
                <History className="w-5 h-5 text-sky-400" />
                <div>
                  <h3 className="text-base font-semibold text-white">Tracking Log History</h3>
                  <p className="text-xs text-slate-400">{timelineRecipient.name} ({timelineRecipient.email})</p>
                </div>
              </div>
              <button
                onClick={() => setTimelineRecipient(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {loadingTimeline ? (
                <div className="text-center py-8 text-slate-400 text-sm">Loading event log history...</div>
              ) : timelineLogs.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">No activity recorded yet.</div>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                  {timelineLogs.map((log) => (
                    <div key={log.id} className="relative flex items-start gap-3">
                      <div className={`absolute -left-6 top-1 w-4 h-4 rounded-full border-2 border-[#111827] ${
                        log.event_type === 'REPLY' ? 'bg-emerald-400' : 'bg-sky-400'
                      }`} />
                      
                      <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 w-full space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-semibold uppercase tracking-wider ${
                            log.event_type === 'REPLY' ? 'text-emerald-400' : 'text-sky-400'
                          }`}>
                            {log.event_type} EVENT
                          </span>
                          <span className="text-slate-400 font-mono">
                            {formatDateTime(log.timestamp)}
                          </span>
                        </div>
                        
                        {log.ip_address && (
                          <div className="text-xs text-slate-400 flex items-center gap-1.5 pt-1">
                            <Globe className="w-3 h-3 text-slate-500" />
                            <span>IP: {log.ip_address}</span>
                          </div>
                        )}

                        {log.user_agent && (
                          <div className="text-[11px] text-slate-500 font-mono truncate" title={log.user_agent}>
                            UA: {log.user_agent}
                          </div>
                        )}

                        {(() => {
                          let parsedDetails = null;
                          if (log.details) {
                            try {
                              parsedDetails = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
                            } catch (e) {}
                          }
                          return (
                            <>
                              {/* Distinct Google image proxy badge vs Suspected automated badge */}
                              {(parsedDetails?.proxyLabel || parsedDetails?.isGoogleProxy || (log.user_agent && /GoogleImageProxy/i.test(log.user_agent))) && (
                                <div className="mt-1 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-medium">
                                  <Shield className="w-3.5 h-3.5 shrink-0 text-sky-400" />
                                  <span>{parsedDetails?.proxyLabel || 'Google image proxy — human open unverified'}</span>
                                </div>
                              )}
                              {parsedDetails?.isSuspectedAutomated && !(parsedDetails?.proxyLabel || parsedDetails?.isGoogleProxy || (log.user_agent && /GoogleImageProxy/i.test(log.user_agent))) && (
                                <div className="mt-1 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                  <span>Suspected Automated Scanner</span>
                                </div>
                              )}
                              {/* Distinct historical simulation badge */}
                              {(parsedDetails?.simulated || (log.ip_address && log.ip_address.includes('Simulated')) || (log.user_agent && log.user_agent.includes('Simulated'))) && (
                                <div className="mt-1 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-medium">
                                  <Clock className="w-3.5 h-3.5 shrink-0 text-purple-400" />
                                  <span>Historical Simulated Event (Legacy)</span>
                                </div>
                              )}
                              {log.details && (
                                <div className="text-xs text-slate-300 bg-slate-950/60 p-2 rounded border border-slate-800/60 mt-2 font-mono">
                                  {log.details}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/60 text-right">
              <button
                onClick={() => setTimelineRecipient(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-xl"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Reply Message Drawer */}
      <ReplyDrawer
        isOpen={Boolean(activeReplyRecipientId)}
        onClose={() => setActiveReplyRecipientId(null)}
        recipientId={activeReplyRecipientId}
      />

    </div>
  );
}
