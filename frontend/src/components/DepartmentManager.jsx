import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Plus, Edit3, Trash2, Archive, RotateCcw, Users, Building2, Hash,
  CheckCircle2, AlertCircle, X, ChevronRight, ChevronDown, Mail, Clock,
  ShieldCheck, BarChart3, Tag, UserPlus, Code2, Eye, Shield
} from 'lucide-react';

const API = '';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Assignment source badge colors
const SOURCE_BADGES = {
  campaign_dept: { label: 'Campaign Dept', bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/20' },
  account_code: { label: 'Account Code', bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' },
  signature_id: { label: 'Signature ID', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  email_match: { label: 'Email Match', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  unassigned: { label: 'Unassigned', bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20' },
};

export function DepartmentBadge({ name, small }) {
  if (!name) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${small ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'} font-semibold rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20`}>
      <Building2 className={small ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      {name}
    </span>
  );
}

export function AssignmentBadge({ source, small }) {
  const info = SOURCE_BADGES[source] || SOURCE_BADGES.unassigned;
  return (
    <span className={`inline-flex items-center gap-1 ${small ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'} font-medium rounded-full ${info.bg} ${info.text} border ${info.border}`}>
      {info.label}
    </span>
  );
}

export default function DepartmentManager({ onBack }) {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  // Create/Edit modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [deptName, setDeptName] = useState('');
  const [deptDesc, setDeptDesc] = useState('');
  const [modalError, setModalError] = useState(null);
  const [modalSaving, setModalSaving] = useState(false);

  // Detail view
  const [selectedDeptId, setSelectedDeptId] = useState(null);
  const [deptDetail, setDeptDetail] = useState(null);
  const [deptStats, setDeptStats] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Participant modal
  const [isParticipantModalOpen, setIsParticipantModalOpen] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState(null);
  const [pName, setPName] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pEmployeeId, setPEmployeeId] = useState('');
  const [pModalError, setPModalError] = useState(null);
  const [pModalSaving, setPModalSaving] = useState(false);

  // Account code modal
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newCodeDesc, setNewCodeDesc] = useState('');
  const [codeModalError, setCodeModalError] = useState(null);
  const [codeModalSaving, setCodeModalSaving] = useState(false);

  // Confirm dialogs
  const [confirmAction, setConfirmAction] = useState(null);

  // Participant logs
  const [participantLogs, setParticipantLogs] = useState(null);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // -------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------
  const fetchDepartments = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/departments`);
      if (res.ok) setDepartments(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchDeptDetail = async (id) => {
    try {
      setLoadingDetail(true);
      const [detailRes, statsRes] = await Promise.all([
        fetch(`${API}/api/departments/${id}`),
        fetch(`${API}/api/departments/${id}/stats`)
      ]);
      if (detailRes.ok) setDeptDetail(await detailRes.json());
      if (statsRes.ok) setDeptStats(await statsRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDetail(false);
    }
  };

  const fetchParticipantLogs = async (deptId, pid) => {
    try {
      setLoadingLogs(true);
      const res = await fetch(`${API}/api/departments/${deptId}/participants/${pid}/logs`);
      if (res.ok) setParticipantLogs(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => { fetchDepartments(); }, []);

  useEffect(() => {
    if (selectedDeptId) fetchDeptDetail(selectedDeptId);
  }, [selectedDeptId]);

  // -------------------------------------------------------
  // Department CRUD
  // -------------------------------------------------------
  const openCreateModal = () => {
    setEditingDept(null);
    setDeptName('');
    setDeptDesc('');
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (dept) => {
    setEditingDept(dept);
    setDeptName(dept.name);
    setDeptDesc(dept.description || '');
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSaveDept = async () => {
    if (!deptName.trim()) {
      setModalError('Department name is required.');
      return;
    }
    setModalSaving(true);
    setModalError(null);
    try {
      const url = editingDept
        ? `${API}/api/departments/${editingDept.id}`
        : `${API}/api/departments`;
      const method = editingDept ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: deptName.trim(), description: deptDesc.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIsModalOpen(false);
      await fetchDepartments();
      if (selectedDeptId) await fetchDeptDetail(selectedDeptId);
    } catch (err) {
      setModalError(err.message);
    } finally {
      setModalSaving(false);
    }
  };

  const handleArchiveDept = async (dept) => {
    try {
      await fetch(`${API}/api/departments/${dept.id}/archive`, { method: 'POST' });
      await fetchDepartments();
      if (selectedDeptId === dept.id) {
        setSelectedDeptId(null);
        setDeptDetail(null);
      }
    } catch (e) {
      console.error(e);
    }
    setConfirmAction(null);
  };

  const handleRestoreDept = async (dept) => {
    try {
      await fetch(`${API}/api/departments/${dept.id}/restore`, { method: 'POST' });
      await fetchDepartments();
      if (selectedDeptId === dept.id) await fetchDeptDetail(selectedDeptId);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteDept = async (dept) => {
    try {
      const res = await fetch(`${API}/api/departments/${dept.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        setTimeout(() => setError(null), 5000);
      } else {
        if (selectedDeptId === dept.id) {
          setSelectedDeptId(null);
          setDeptDetail(null);
        }
        await fetchDepartments();
      }
    } catch (e) {
      console.error(e);
    }
    setConfirmAction(null);
  };

  // -------------------------------------------------------
  // Participant CRUD
  // -------------------------------------------------------
  const openAddParticipant = () => {
    setEditingParticipant(null);
    setPName('');
    setPEmail('');
    setPEmployeeId('');
    setPModalError(null);
    setIsParticipantModalOpen(true);
  };

  const openEditParticipant = (p) => {
    setEditingParticipant(p);
    setPName(p.name);
    setPEmail(p.email);
    setPEmployeeId(p.employee_id || '');
    setPModalError(null);
    setIsParticipantModalOpen(true);
  };

  const handleSaveParticipant = async () => {
    if (!pName.trim()) { setPModalError('Name is required.'); return; }
    if (!pEmail.trim() || !EMAIL_REGEX.test(pEmail.trim())) { setPModalError('Valid email is required.'); return; }

    setPModalSaving(true);
    setPModalError(null);
    try {
      const url = editingParticipant
        ? `${API}/api/departments/${selectedDeptId}/participants/${editingParticipant.id}`
        : `${API}/api/departments/${selectedDeptId}/participants`;
      const method = editingParticipant ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: pName.trim(), email: pEmail.trim(), employee_id: pEmployeeId.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIsParticipantModalOpen(false);
      await fetchDeptDetail(selectedDeptId);
    } catch (err) {
      setPModalError(err.message);
    } finally {
      setPModalSaving(false);
    }
  };

  const handleRemoveParticipant = async (p) => {
    try {
      await fetch(`${API}/api/departments/${selectedDeptId}/participants/${p.id}`, { method: 'DELETE' });
      await fetchDeptDetail(selectedDeptId);
    } catch (e) {
      console.error(e);
    }
    setConfirmAction(null);
  };

  // -------------------------------------------------------
  // Account Code CRUD
  // -------------------------------------------------------
  const handleAddCode = async () => {
    if (!newCode.trim()) { setCodeModalError('Account code is required.'); return; }
    setCodeModalSaving(true);
    setCodeModalError(null);
    try {
      const res = await fetch(`${API}/api/departments/${selectedDeptId}/account-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_code: newCode.trim(), description: newCodeDesc.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIsCodeModalOpen(false);
      setNewCode('');
      setNewCodeDesc('');
      await fetchDeptDetail(selectedDeptId);
    } catch (err) {
      setCodeModalError(err.message);
    } finally {
      setCodeModalSaving(false);
    }
  };

  const handleRemoveCode = async (code) => {
    try {
      await fetch(`${API}/api/departments/${selectedDeptId}/account-codes/${code.id}`, { method: 'DELETE' });
      await fetchDeptDetail(selectedDeptId);
    } catch (e) {
      console.error(e);
    }
    setConfirmAction(null);
  };

  // -------------------------------------------------------
  // Filtered list
  // -------------------------------------------------------
  const filteredDepts = departments.filter(d =>
    showArchived ? true : d.status === 'active'
  );

  // -------------------------------------------------------
  // Confirm dialog component
  // -------------------------------------------------------
  const ConfirmDialog = () => {
    if (!confirmAction) return null;
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
        <div className="bg-[#111827] border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
          <h3 className="text-base font-semibold text-white mb-2">{confirmAction.title}</h3>
          <p className="text-sm text-slate-400 mb-5">{confirmAction.message}</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirmAction(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">Cancel</button>
            <button onClick={confirmAction.onConfirm} className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${confirmAction.danger ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30' : 'bg-sky-500 text-white hover:bg-sky-400'}`}>
              {confirmAction.confirmLabel || 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------
  // Participant Logs Drawer
  // -------------------------------------------------------
  const ParticipantLogsView = () => {
    if (!participantLogs) return null;
    return (
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
        <div className="bg-[#111827] border border-slate-800 rounded-t-2xl sm:rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
            <div>
              <h3 className="text-base font-semibold text-white">{participantLogs.participant.name}'s Action Logs</h3>
              <p className="text-xs text-slate-400">{participantLogs.participant.email}</p>
            </div>
            <button onClick={() => setParticipantLogs(null)} className="p-2 text-slate-400 hover:text-white rounded-lg"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
            {loadingLogs ? (
              <div className="py-12 text-center text-slate-500">Loading logs...</div>
            ) : participantLogs.recipients.length === 0 ? (
              <div className="py-12 text-center text-slate-500">No action logs found for this participant.</div>
            ) : (
              <div className="space-y-2">
                {participantLogs.recipients.map(r => (
                  <div key={r.id} className="bg-slate-900 rounded-xl p-3 border border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-white">{r.email}</span>
                        <span className="text-xs text-slate-500 ml-2">{r.campaign_subject}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.status === 'REPLIED' ? 'bg-emerald-500/10 text-emerald-400' : r.status === 'OPENED' ? 'bg-sky-500/10 text-sky-400' : 'bg-slate-500/10 text-slate-400'}`}>
                        {r.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                      <span>Sent: {new Date(r.sent_at).toLocaleDateString()}</span>
                      {r.tat_reply_formatted && <span>Reply TAT: <span className="text-emerald-400 font-medium">{r.tat_reply_formatted}</span></span>}
                      {r.assignment_source && <AssignmentBadge source={r.assignment_source} small />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------
  // DEPARTMENT DETAIL VIEW
  // -------------------------------------------------------
  if (selectedDeptId && deptDetail) {
    const stats = deptStats?.stats || {};
    const assignBreakdown = stats.assignment_breakdown || [];

    return (
      <div className="space-y-6 animate-fade-in">
        <ConfirmDialog />
        <ParticipantLogsView />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => { setSelectedDeptId(null); setDeptDetail(null); setDeptStats(null); }} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{deptDetail.name}</h2>
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${deptDetail.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}`}>
                  {deptDetail.status}
                </span>
              </div>
              {deptDetail.description && <p className="text-sm text-slate-400">{deptDetail.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => openEditModal(deptDetail)} className="flex items-center gap-1.5 px-3 py-2 text-xs bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 transition-colors">
              <Edit3 className="w-3.5 h-3.5" /> Edit
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
            <div className="text-xs text-slate-400 font-semibold uppercase">Active Members</div>
            <div className="text-xl font-bold text-white mt-1">{deptDetail.active_participant_count}</div>
          </div>
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
            <div className="text-xs text-slate-400 font-semibold uppercase">Campaigns</div>
            <div className="text-xl font-bold text-sky-400 mt-1">{deptDetail.campaign_count}</div>
          </div>
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
            <div className="text-xs text-slate-400 font-semibold uppercase">Total Recipients</div>
            <div className="text-xl font-bold text-white mt-1">{stats.total_recipients || 0}</div>
          </div>
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
            <div className="text-xs text-slate-400 font-semibold uppercase">Actioned</div>
            <div className="text-xl font-bold text-emerald-400 mt-1">{stats.actioned_count || 0}</div>
          </div>
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
            <div className="text-xs text-slate-400 font-semibold uppercase">Avg Reply TAT</div>
            <div className="text-lg font-bold text-sky-300 mt-1">{stats.avg_reply_tat_formatted || 'N/A'}</div>
          </div>
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
            <div className="text-xs text-slate-400 font-semibold uppercase">SLA Breached</div>
            <div className="text-xl font-bold text-red-400 mt-1">{stats.sla_breached_count || 0}</div>
          </div>
        </div>

        {/* Assignment Breakdown */}
        {assignBreakdown.length > 0 && (
          <div className="glass-panel rounded-2xl p-5 border border-slate-800">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-sky-400" /> Assignment Source Breakdown
            </h3>
            <div className="flex flex-wrap gap-3">
              {assignBreakdown.map(item => (
                <div key={item.assignment_source} className="flex items-center gap-2 bg-slate-900 px-3 py-2 rounded-xl border border-slate-800">
                  <AssignmentBadge source={item.assignment_source} />
                  <span className="text-sm font-bold text-white">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Participants Section */}
        <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-slate-800/80 bg-slate-900/40">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-white">Participants ({deptDetail.participants?.length || 0})</h3>
            </div>
            <button onClick={openAddParticipant} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 rounded-xl border border-sky-500/30 font-semibold transition-colors">
              <UserPlus className="w-3.5 h-3.5" /> Add Participant
            </button>
          </div>

          {deptDetail.participants?.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              <Users className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              No participants yet. Add team members to this department.
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Employee ID</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(deptDetail.participants || []).map(p => (
                    <tr key={p.id} className="hover:bg-slate-900/60 transition-colors">
                      <td className="px-5 py-3">
                        <button
                          onClick={() => fetchParticipantLogs(selectedDeptId, p.id)}
                          className="font-medium text-white hover:text-sky-400 transition-colors"
                        >
                          {p.name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs font-mono">{p.email}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{p.employee_id || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-400'}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEditParticipant(p)} className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded-lg transition-colors" title="Edit">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmAction({
                              title: 'Remove Participant',
                              message: `Remove "${p.name}" (${p.email}) from this department? Historical records are preserved.`,
                              confirmLabel: 'Remove',
                              danger: true,
                              onConfirm: () => handleRemoveParticipant(p)
                            })}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Account Codes Section */}
        <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-slate-800/80 bg-slate-900/40">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-violet-400" />
              <h3 className="text-sm font-semibold text-white">Account / Customer Codes ({deptDetail.account_codes?.length || 0})</h3>
            </div>
            <button onClick={() => { setCodeModalError(null); setNewCode(''); setNewCodeDesc(''); setIsCodeModalOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 rounded-xl border border-violet-500/30 font-semibold transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Code
            </button>
          </div>

          {deptDetail.account_codes?.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">
              No account codes configured. Add codes for auto-assignment.
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {(deptDetail.account_codes || []).map(code => (
                <div key={code.id} className="flex items-center justify-between bg-slate-900 px-4 py-2.5 rounded-xl border border-slate-800/80">
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-lg text-xs font-mono font-semibold">{code.account_code}</span>
                    {code.description && <span className="text-xs text-slate-400">{code.description}</span>}
                  </div>
                  <button
                    onClick={() => setConfirmAction({
                      title: 'Remove Account Code',
                      message: `Remove account code "${code.account_code}"?`,
                      confirmLabel: 'Remove',
                      danger: true,
                      onConfirm: () => handleRemoveCode(code)
                    })}
                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Campaigns linked to this department */}
        {deptStats?.campaigns?.length > 0 && (
          <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
            <div className="p-5 border-b border-slate-800/80 bg-slate-900/40">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-sky-400" /> Campaigns Sent to This Department
              </h3>
            </div>
            <div className="p-4 space-y-2">
              {deptStats.campaigns.map(c => (
                <div key={c.id} className="bg-slate-900 px-4 py-2.5 rounded-xl border border-slate-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-white">{c.subject}</span>
                    {c.title && c.title !== c.subject && <span className="text-xs text-slate-400 ml-2">{c.title}</span>}
                  </div>
                  <span className="text-xs text-slate-400">{new Date(c.sent_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modals */}
        {isModalOpen && renderDeptModal()}
        {isParticipantModalOpen && renderParticipantModal()}
        {isCodeModalOpen && renderCodeModal()}
      </div>
    );
  }

  // -------------------------------------------------------
  // MODAL RENDERERS
  // -------------------------------------------------------
  function renderDeptModal() {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
        <div className="bg-[#111827] border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold text-white">{editingDept ? 'Edit Department' : 'Create Department'}</h3>
            <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-white rounded-lg"><X className="w-5 h-5" /></button>
          </div>
          {modalError && (
            <div className="p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {modalError}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Department Name <span className="text-red-400">*</span></label>
              <input type="text" value={deptName} onChange={e => setDeptName(e.target.value)} placeholder="e.g. Engineering" className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors" autoFocus />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Description</label>
              <textarea value={deptDesc} onChange={e => setDeptDesc(e.target.value)} placeholder="Optional description" rows={2} className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors" />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
            <button onClick={handleSaveDept} disabled={modalSaving} className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
              {modalSaving ? 'Saving...' : editingDept ? 'Save Changes' : 'Create Department'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderParticipantModal() {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
        <div className="bg-[#111827] border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold text-white">{editingParticipant ? 'Edit Participant' : 'Add Participant'}</h3>
            <button onClick={() => setIsParticipantModalOpen(false)} className="p-2 text-slate-400 hover:text-white rounded-lg"><X className="w-5 h-5" /></button>
          </div>
          {pModalError && (
            <div className="p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {pModalError}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Full Name <span className="text-red-400">*</span></label>
              <input type="text" value={pName} onChange={e => setPName(e.target.value)} placeholder="e.g. Alex Rivera" className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors" autoFocus />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Work Email <span className="text-red-400">*</span></label>
              <input type="email" value={pEmail} onChange={e => setPEmail(e.target.value)} placeholder="alex@company.com" className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-4 py-2.5 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Employee / Signature ID <span className="text-slate-500">(optional)</span></label>
              <input type="text" value={pEmployeeId} onChange={e => setPEmployeeId(e.target.value)} placeholder="e.g. EMP-1234" className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-4 py-2.5 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors" />
              <p className="text-[11px] text-slate-500 mt-1">Used for auto-assignment when this ID is found in email signatures or body text.</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setIsParticipantModalOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
            <button onClick={handleSaveParticipant} disabled={pModalSaving} className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
              {pModalSaving ? 'Saving...' : editingParticipant ? 'Save Changes' : 'Add Participant'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderCodeModal() {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
        <div className="bg-[#111827] border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold text-white">Add Account Code</h3>
            <button onClick={() => setIsCodeModalOpen(false)} className="p-2 text-slate-400 hover:text-white rounded-lg"><X className="w-5 h-5" /></button>
          </div>
          {codeModalError && (
            <div className="p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {codeModalError}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Account / Customer Code <span className="text-red-400">*</span></label>
              <input type="text" value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="e.g. ACCT-2024-001" className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-4 py-2.5 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors" autoFocus />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Description <span className="text-slate-500">(optional)</span></label>
              <input type="text" value={newCodeDesc} onChange={e => setNewCodeDesc(e.target.value)} placeholder="e.g. ACME Corp main account" className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors" />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setIsCodeModalOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
            <button onClick={handleAddCode} disabled={codeModalSaving} className="px-5 py-2 bg-violet-500 hover:bg-violet-400 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
              {codeModalSaving ? 'Adding...' : 'Add Code'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // DEPARTMENT LIST VIEW (default)
  // -------------------------------------------------------
  return (
    <div className="space-y-6 animate-fade-in">
      <ConfirmDialog />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
              <Building2 className="w-6 h-6 text-indigo-400" /> Department Management
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">Manage departments, participants, and account code mappings for auto-assignment</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-xl border transition-colors ${showArchived ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'}`}
          >
            <Archive className="w-3.5 h-3.5" /> {showArchived ? 'Hide Archived' : 'Show Archived'}
          </button>
          <button onClick={openCreateModal} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-500/20 transition-all">
            <Plus className="w-4 h-4" /> New Department
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Department Cards */}
      {loading ? (
        <div className="py-16 text-center text-slate-500">Loading departments...</div>
      ) : filteredDepts.length === 0 ? (
        <div className="glass-panel rounded-2xl border border-slate-800 py-16 text-center">
          <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm mb-4">{showArchived ? 'No departments found.' : 'No active departments yet.'}</p>
          <button onClick={openCreateModal} className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold rounded-xl">
            Create First Department
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDepts.map(dept => (
            <div
              key={dept.id}
              className={`glass-panel glass-panel-hover rounded-2xl border border-slate-800 p-5 cursor-pointer transition-all group ${dept.status === 'archived' ? 'opacity-60' : ''}`}
              onClick={() => setSelectedDeptId(dept.id)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-white truncate group-hover:text-indigo-400 transition-colors">{dept.name}</h3>
                  {dept.description && <p className="text-xs text-slate-400 mt-0.5 truncate">{dept.description}</p>}
                </div>
                <span className={`shrink-0 ml-2 px-2 py-0.5 text-[10px] font-semibold rounded-full ${dept.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}`}>
                  {dept.status}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-slate-950/60 rounded-lg p-2 text-center">
                  <div className="text-xs text-slate-400">Members</div>
                  <div className="text-sm font-bold text-white">{dept.active_participant_count}</div>
                </div>
                <div className="bg-slate-950/60 rounded-lg p-2 text-center">
                  <div className="text-xs text-slate-400">Total</div>
                  <div className="text-sm font-bold text-slate-300">{dept.total_participant_count}</div>
                </div>
                <div className="bg-slate-950/60 rounded-lg p-2 text-center">
                  <div className="text-xs text-slate-400">Campaigns</div>
                  <div className="text-sm font-bold text-sky-400">{dept.campaign_count}</div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">Created {new Date(dept.created_at).toLocaleDateString()}</span>
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={(e) => { e.stopPropagation(); openEditModal(dept); }} className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded-lg transition-colors" title="Edit">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  {dept.status === 'active' ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmAction({
                          title: 'Archive Department',
                          message: `Archive "${dept.name}"? It won't appear in campaign selection but historical data is preserved.`,
                          confirmLabel: 'Archive',
                          danger: false,
                          onConfirm: () => handleArchiveDept(dept)
                        });
                      }}
                      className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors"
                      title="Archive"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); handleRestoreDept(dept); }} className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors" title="Restore">
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmAction({
                        title: 'Delete Department',
                        message: `Delete "${dept.name}" permanently? This is only allowed if the department has no campaign history.`,
                        confirmLabel: 'Delete',
                        danger: true,
                        onConfirm: () => handleDeleteDept(dept)
                      });
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {isModalOpen && renderDeptModal()}
    </div>
  );
}
