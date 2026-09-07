import React, { useState, useEffect } from 'react';
import { 
  X, Search, User, CheckCircle2, Clock, AlertTriangle, ShieldCheck, 
  RefreshCw, ExternalLink, Mail, History, ArrowRight, UserCheck, ShieldAlert
} from 'lucide-react';

export default function TeamMemberDrawer({
  isOpen,
  onClose,
  teamMember, // { id, name, email, team } or null for unassigned
  teamMembers, // All team members list for reassigning
  onSelectCampaign,
  onRefreshTeamStats
}) {
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'pending', 'actioned'

  // Selected rows for bulk assignment
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAssigneeId, setBulkAssigneeId] = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);

  // History modal state
  const [historyRecipient, setHistoryRecipient] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        if (historyRecipient) {
          setHistoryRecipient(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, historyRecipient, onClose]);

  const memberId = teamMember ? teamMember.id : 'unassigned';
  const memberName = teamMember ? teamMember.name : 'Unassigned Queue';

  // Fetch recipient logs assigned to this team member
  const fetchAssignedRecipients = async () => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      queryParams.set('assigneeId', memberId === null ? 'unassigned' : memberId);
      if (statusFilter !== 'all') queryParams.set('status', statusFilter);
      if (searchTerm.trim()) queryParams.set('search', searchTerm.trim());

      const res = await fetch(`/api/stats/recipients?${queryParams.toString()}`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      setRecipients(data.recipients || []);
      setSelectedIds([]);
    } catch (err) {
      console.error('Failed fetching team member logs:', err);
      setError(err.message || 'Failed to load assigned emails');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(fetchAssignedRecipients, 200);
    return () => clearTimeout(timer);
  }, [isOpen, memberId, statusFilter, searchTerm]);

  if (!isOpen) return null;

  // Single recipient reassignment handler
  const handleSingleAssign = async (recipientId, newAssigneeId) => {
    try {
      const res = await fetch(`/api/recipients/${recipientId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignee_id: newAssigneeId ? parseInt(newAssigneeId, 10) : null,
          actor: 'Manager',
          note: 'Reassigned from team member drawer'
        })
      });
      if (res.ok) {
        await fetchAssignedRecipients();
        if (onRefreshTeamStats) onRefreshTeamStats();
      }
    } catch (err) {
      console.error('Failed to reassign recipient:', err);
    }
  };

  // Bulk reassignment handler
  const handleBulkAssign = async () => {
    if (selectedIds.length === 0) return;
    setBulkAssigning(true);
    try {
      const res = await fetch('/api/recipients/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_ids: selectedIds,
          assignee_id: bulkAssigneeId ? parseInt(bulkAssigneeId, 10) : null,
          actor: 'Manager',
          note: `Bulk reassignment of ${selectedIds.length} items`
        })
      });
      if (res.ok) {
        setSelectedIds([]);
        setBulkAssigneeId('');
        await fetchAssignedRecipients();
        if (onRefreshTeamStats) onRefreshTeamStats();
      }
    } catch (err) {
      console.error('Failed bulk assignment:', err);
    } finally {
      setBulkAssigning(false);
    }
  };

  // View assignment history timeline
  const handleViewHistory = async (recipient) => {
    setHistoryRecipient(recipient);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/recipients/${recipient.id}/history`);
      if (res.ok) {
        const logs = await res.json();
        setHistoryLogs(logs);
      }
    } catch (err) {
      console.error('Failed loading assignment history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === recipients.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(recipients.map(r => r.id));
    }
  };

  const toggleSelectRow = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

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

  const getRuleBadge = (rule, confidence) => {
    switch (rule) {
      case 'account_code':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">Auto: Customer Code</span>;
      case 'direct_recipient':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Auto: Direct Recipient</span>;
      case 'signature_match':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">Auto: Signature Match</span>;
      case 'manual':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Manual Assignment</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">Unassigned / Default</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-fade-in">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Main Drawer Container */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-4xl bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col">
          
          {/* Drawer Header */}
          <div className="p-6 border-b border-slate-800/80 bg-slate-950/40 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 font-bold text-base">
                  {memberName[0].toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    <span>{memberName}</span>
                    <span className="text-xs font-normal text-slate-400">|</span>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      {teamMember?.team || 'Default Queue'}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {teamMember?.email ? teamMember.email : 'Unassigned email workload queue'} • {recipients.length} Assigned Items
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter & Search Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search recipient, email, or campaign..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 text-xs text-white placeholder-slate-500 rounded-xl pl-9 pr-8 py-2 outline-none transition-colors"
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

              {/* Status Tabs */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1 rounded-lg font-medium transition-colors ${statusFilter === 'all' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  All ({recipients.length})
                </button>
                <button
                  onClick={() => setStatusFilter('pending')}
                  className={`px-3 py-1 rounded-lg font-medium transition-colors ${statusFilter === 'pending' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  Pending
                </button>
                <button
                  onClick={() => setStatusFilter('actioned')}
                  className={`px-3 py-1 rounded-lg font-medium transition-colors ${statusFilter === 'actioned' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  Actioned
                </button>
              </div>
            </div>

            {/* Bulk Actions Bar */}
            {selectedIds.length > 0 && (
              <div className="flex items-center justify-between gap-3 p-3 bg-sky-500/10 border border-sky-500/20 rounded-xl animate-fade-in">
                <span className="text-xs font-semibold text-sky-300">
                  {selectedIds.length} items selected for bulk assignment
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={bulkAssigneeId}
                    onChange={(e) => setBulkAssigneeId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-1.5 outline-none"
                  >
                    <option value="">Reassign to...</option>
                    <option value="">Unassigned Queue</option>
                    {teamMembers.map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.team})</option>
                    ))}
                  </select>
                  <button
                    onClick={handleBulkAssign}
                    disabled={bulkAssigning}
                    className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {bulkAssigning ? 'Reassigning...' : 'Apply Bulk Reassign'}
                  </button>
                </div>
              </div>
            )}

          </div>

          {/* Table Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
                <span className="text-xs font-medium">Loading assigned emails...</span>
              </div>
            ) : error ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-rose-400">
                <AlertTriangle className="w-8 h-8" />
                <span className="text-sm font-semibold">{error}</span>
              </div>
            ) : recipients.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center gap-2 text-slate-500">
                <Mail className="w-10 h-10 stroke-1 text-slate-600 mb-1" />
                <span className="text-sm font-semibold text-slate-400">No emails found for {memberName}</span>
                <span className="text-xs text-slate-500">Try adjusting your status or search filters</span>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-3 w-10 text-center">
                        <input 
                          type="checkbox" 
                          checked={selectedIds.length === recipients.length && recipients.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-0 cursor-pointer"
                        />
                      </th>
                      <th className="py-3 px-4">Recipient</th>
                      <th className="py-3 px-4">Campaign</th>
                      <th className="py-3 px-4">Assignment Rule</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">TAT / SLA</th>
                      <th className="py-3 px-4">Assignee</th>
                      <th className="py-3 px-4 text-right">Audit Trail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">
                    {recipients.map((r) => (
                      <tr 
                        key={r.id}
                        className="hover:bg-slate-800/50 transition-colors group"
                      >
                        <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox"
                            checked={selectedIds.includes(r.id)}
                            onChange={() => toggleSelectRow(r.id)}
                            className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-0 cursor-pointer"
                          />
                        </td>

                        {/* Recipient */}
                        <td className="py-3.5 px-4 font-medium">
                          <div className="text-white font-semibold">{r.name || 'Unnamed'}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{r.email}</div>
                        </td>

                        {/* Campaign */}
                        <td className="py-3.5 px-4">
                          <span 
                            onClick={() => { onSelectCampaign(r.campaign_id); onClose(); }}
                            className="text-slate-300 hover:text-sky-300 transition-colors cursor-pointer line-clamp-1 max-w-[150px]" 
                            title={r.campaign_subject}
                          >
                            {r.campaign_subject || `Campaign #${r.campaign_id}`}
                          </span>
                        </td>

                        {/* Assignment Rule & Reason */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col gap-1">
                            {getRuleBadge(r.assignment_rule, r.assignment_confidence)}
                            <span className="text-[10px] text-slate-400 line-clamp-1" title={r.assignment_reason}>
                              {r.assignment_reason || 'System default'}
                            </span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          {r.status === 'REPLIED' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" /> Actioned
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              <Clock className="w-3 h-3" /> Pending
                            </span>
                          )}
                        </td>

                        {/* TAT / SLA */}
                        <td className="py-3.5 px-4">
                          <div className="font-mono text-[11px]">
                            {r.status === 'REPLIED' ? (
                              <span className="text-emerald-400 font-semibold">{r.tat_reply_formatted || 'N/A'}</span>
                            ) : (
                              <span className="text-amber-400 font-semibold">{r.waiting_tat_formatted || 'N/A'}</span>
                            )}
                          </div>
                          <div className="mt-0.5">
                            {r.sla_status === 'BREACHED' ? (
                              <span className="text-[10px] text-rose-400 font-semibold flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Breached
                              </span>
                            ) : r.sla_status === 'AT_RISK' ? (
                              <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
                                <Clock className="w-3 h-3" /> At Risk
                              </span>
                            ) : (
                              <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3" /> On Track
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Assignee Reassignment Dropdown */}
                        <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={r.assignee_id || ''}
                            onChange={(e) => handleSingleAssign(r.id, e.target.value)}
                            className="bg-slate-950 border border-slate-800 hover:border-slate-700 text-[11px] text-slate-200 rounded-lg px-2 py-1 outline-none transition-colors"
                          >
                            <option value="">Unassigned</option>
                            {teamMembers.map(m => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </td>

                        {/* Audit History Button */}
                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleViewHistory(r)}
                            className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="View Assignment History Audit Trail"
                          >
                            <History className="w-4 h-4" />
                          </button>
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
            <span>Showing {recipients.length} emails assigned to {memberName}</span>
            <span className="text-slate-400">Reassignments are recorded in immutable audit log</span>
          </div>

        </div>
      </div>

      {/* Audit Trail History Modal */}
      {historyRecipient && (
        <div className="fixed inset-0 z-60 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setHistoryRecipient(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 pb-4 border-b border-slate-800 mb-4">
              <History className="w-5 h-5 text-sky-400" />
              <div>
                <h3 className="text-base font-bold text-white">Assignment Audit History</h3>
                <p className="text-xs text-slate-400">{historyRecipient.name} ({historyRecipient.email})</p>
              </div>
            </div>

            {historyLoading ? (
              <div className="py-8 text-center text-slate-400 text-xs">Loading audit trail...</div>
            ) : historyLogs.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">No prior reassignment logs recorded.</div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                {historyLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-400 font-mono text-[10px]">
                      <span>{formatDate(log.created_at)}</span>
                      <span className="font-semibold text-sky-400">{log.actor}</span>
                    </div>
                    <div className="flex items-center gap-2 text-white font-medium">
                      <span>{log.prior_assignee_name || 'Unassigned'}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-emerald-400 font-bold">{log.new_assignee_name || 'Unassigned Queue'}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-300">Rule: </span>{log.assignment_rule || 'manual'} • {log.assignment_reason}
                    </div>
                    {log.note && (
                      <div className="text-[10px] text-slate-500 italic mt-0.5">Note: "{log.note}"</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
