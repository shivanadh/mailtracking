import React, { useState, useEffect } from 'react';
import { 
  Users, UserPlus, Shield, Plus, Trash2, Edit2, Check, Download, Upload, 
  RefreshCw, CheckCircle2, AlertTriangle, ArrowRight, Zap, Info, FileText
} from 'lucide-react';

export default function AssignmentSettingsTab() {
  const [activeSubTab, setActiveSubTab] = useState('members'); // 'members' | 'mappings' | 'rules'

  // Data state
  const [teamMembers, setTeamMembers] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // New Team Member Form
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberTeam, setNewMemberTeam] = useState('Support');
  const [addingMember, setAddingMember] = useState(false);

  // New Account Mapping Form
  const [newAccountCode, setNewAccountCode] = useState('');
  const [newMappingMemberId, setNewMappingMemberId] = useState('');
  const [newMappingTeamName, setNewMappingTeamName] = useState('Support');
  const [newMappingDesc, setNewMappingDesc] = useState('');
  const [addingMapping, setAddingMapping] = useState(false);

  // Import / Export JSON modal state
  const [importJsonText, setImportJsonText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');

  const fetchSettingsData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersRes, mappingsRes] = await Promise.all([
        fetch('/api/team-members'),
        fetch('/api/account-mappings')
      ]);

      if (membersRes.ok) setTeamMembers(await membersRes.json());
      if (mappingsRes.ok) setMappings(await mappingsRes.json());
    } catch (err) {
      console.error('Failed loading assignment settings data:', err);
      setError('Failed loading settings data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettingsData();
  }, []);

  // Add Team Member
  const handleAddTeamMember = async (e) => {
    e.preventDefault();
    if (!newMemberName.trim() || !newMemberEmail.trim()) return;
    setAddingMember(true);
    try {
      const res = await fetch('/api/team-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newMemberName.trim(),
          email: newMemberEmail.trim(),
          team: newMemberTeam.trim(),
          capacity_status: 'AVAILABLE'
        })
      });
      if (res.ok) {
        setNewMemberName('');
        setNewMemberEmail('');
        await fetchSettingsData();
      } else {
        const errJson = await res.json();
        alert(`Error: ${errJson.error}`);
      }
    } catch (err) {
      console.error('Failed creating team member:', err);
    } finally {
      setAddingMember(false);
    }
  };

  // Toggle Active Status for Team Member
  const handleToggleMemberActive = async (member) => {
    try {
      await fetch(`/api/team-members/${member.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active_status: member.active_status === 1 ? 0 : 1
        })
      });
      fetchSettingsData();
    } catch (err) {
      console.error('Failed updating team member active status:', err);
    }
  };

  // Add Account Code Mapping
  const handleAddAccountMapping = async (e) => {
    e.preventDefault();
    if (!newAccountCode.trim()) return;
    setAddingMapping(true);
    try {
      const res = await fetch('/api/account-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_code: newAccountCode.trim().toUpperCase(),
          team_member_id: newMappingMemberId ? parseInt(newMappingMemberId, 10) : null,
          team_name: newMappingTeamName.trim(),
          description: newMappingDesc.trim(),
          is_active: 1
        })
      });
      if (res.ok) {
        setNewAccountCode('');
        setNewMappingDesc('');
        await fetchSettingsData();
      } else {
        const errJson = await res.json();
        alert(`Error: ${errJson.error}`);
      }
    } catch (err) {
      console.error('Failed creating account mapping:', err);
    } finally {
      setAddingMapping(false);
    }
  };

  // Delete Account Code Mapping
  const handleDeleteMapping = async (id) => {
    if (!confirm('Are you sure you want to delete this customer code mapping?')) return;
    try {
      await fetch(`/api/account-mappings/${id}`, { method: 'DELETE' });
      fetchSettingsData();
    } catch (err) {
      console.error('Failed deleting account mapping:', err);
    }
  };

  // Export Mappings JSON
  const handleExportMappings = () => {
    const jsonStr = JSON.stringify(mappings, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mailpulse_account_mappings_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import Mappings JSON
  const handleImportMappings = async () => {
    if (!importJsonText.trim()) return;
    setImporting(true);
    setImportStatus('');
    try {
      const parsed = JSON.parse(importJsonText);
      const res = await fetch('/api/account-mappings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: parsed })
      });
      if (res.ok) {
        const data = await res.json();
        setImportStatus(`Successfully imported ${data.count} mappings!`);
        setImportJsonText('');
        fetchSettingsData();
      } else {
        const errJson = await res.json();
        setImportStatus(`Import Error: ${errJson.error}`);
      }
    } catch (err) {
      setImportStatus(`Invalid JSON payload: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-xs text-slate-300">
      
      {/* Settings Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveSubTab('members')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-colors cursor-pointer ${activeSubTab === 'members' ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20' : 'bg-slate-900 hover:bg-slate-800 text-slate-400'}`}
        >
          <Users className="w-4 h-4" />
          <span>Team Members ({teamMembers.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('mappings')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-colors cursor-pointer ${activeSubTab === 'mappings' ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20' : 'bg-slate-900 hover:bg-slate-800 text-slate-400'}`}
        >
          <Zap className="w-4 h-4" />
          <span>Customer Code Mappings ({mappings.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('rules')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-colors cursor-pointer ${activeSubTab === 'rules' ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20' : 'bg-slate-900 hover:bg-slate-800 text-slate-400'}`}
        >
          <Shield className="w-4 h-4" />
          <span>Rule Engine Priority</span>
        </button>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center items-center text-slate-400 gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-sky-400" />
          <span>Loading assignment configuration...</span>
        </div>
      ) : activeSubTab === 'members' ? (

        /* SUB-TAB 1: TEAM MEMBERS MANAGEMENT */
        <div className="space-y-6">
          
          {/* Add Team Member Form */}
          <form onSubmit={handleAddTeamMember} className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-sky-400" />
              <span>Add New Team Member</span>
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Alex Rivera"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-2 outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Work Email *</label>
                <input
                  type="email"
                  placeholder="alex.rivera@company.com"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-2 outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Team Department</label>
                <select
                  value={newMemberTeam}
                  onChange={(e) => setNewMemberTeam(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-2 outline-none cursor-pointer"
                >
                  <option value="Support">Support</option>
                  <option value="Sales">Sales</option>
                  <option value="Billing">Billing</option>
                  <option value="Engineering">Engineering</option>
                  <option value="General">General</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={addingMember}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white font-semibold rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>{addingMember ? 'Saving...' : 'Add Team Member'}</span>
              </button>
            </div>
          </form>

          {/* Members Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-semibold uppercase border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Member Name</th>
                  <th className="py-3 px-4">Work Email</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Active Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">
                {teamMembers.map(m => (
                  <tr key={m.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-white">
                      {m.name}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      {m.email}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                        {m.team}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {m.active_status === 1 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-500 border border-slate-700">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleToggleMemberActive(m)}
                        className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${m.active_status === 1 ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'}`}
                      >
                        {m.active_status === 1 ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>

      ) : activeSubTab === 'mappings' ? (

        /* SUB-TAB 2: CUSTOMER CODE MAPPINGS */
        <div className="space-y-6">
          
          {/* Add Mapping Form */}
          <form onSubmit={handleAddAccountMapping} className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-sky-400" />
              <span>Add Customer/Account Code Mapping</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Customer/Account Code *</label>
                <input
                  type="text"
                  placeholder="e.g. CUST-1001"
                  value={newAccountCode}
                  onChange={(e) => setNewAccountCode(e.target.value.toUpperCase())}
                  className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-2 outline-none font-mono uppercase focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Assigned Team Member</label>
                <select
                  value={newMappingMemberId}
                  onChange={(e) => setNewMappingMemberId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-2 outline-none cursor-pointer"
                >
                  <option value="">Unassigned / Queue Only</option>
                  {teamMembers.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.team})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Target Department</label>
                <select
                  value={newMappingTeamName}
                  onChange={(e) => setNewMappingTeamName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-2 outline-none cursor-pointer"
                >
                  <option value="Support">Support</option>
                  <option value="Sales">Sales</option>
                  <option value="Billing">Billing</option>
                  <option value="General">General</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Description / Note</label>
                <input
                  type="text"
                  placeholder="VIP Enterprise Account"
                  value={newMappingDesc}
                  onChange={(e) => setNewMappingDesc(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-2 outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportMappings}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-sky-400" />
                  <span>Export JSON</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={addingMapping}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white font-semibold rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>{addingMapping ? 'Saving...' : 'Add Mapping'}</span>
              </button>
            </div>
          </form>

          {/* Mappings Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-semibold uppercase border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-mono">Account Code</th>
                  <th className="py-3 px-4">Mapped Assignee</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-right">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">
                {mappings.map(m => (
                  <tr key={m.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-sky-400">
                      {m.account_code}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-white">
                      {m.member_name ? `${m.member_name} (${m.member_email})` : 'Unassigned Queue'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                        {m.team_name || 'General'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {m.description || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleDeleteMapping(m.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Import JSON Box */}
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
            <h4 className="font-bold text-white flex items-center gap-2">
              <Upload className="w-4 h-4 text-sky-400" />
              <span>Bulk Import Account Mappings (JSON)</span>
            </h4>
            <textarea
              rows={3}
              placeholder='[{"account_code": "CUST-909", "team_member_email": "alex.rivera@company.com", "team_name": "Support"}]'
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-white font-mono text-[11px] rounded-xl p-3 outline-none focus:border-sky-500"
            />
            <div className="flex items-center justify-between">
              <span className="text-emerald-400 font-semibold">{importStatus}</span>
              <button
                onClick={handleImportMappings}
                disabled={importing || !importJsonText.trim()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                {importing ? 'Importing...' : 'Upload & Import JSON'}
              </button>
            </div>
          </div>

        </div>

      ) : (

        /* SUB-TAB 3: RULE ENGINE PRIORITY */
        <div className="space-y-4">
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-sky-400" />
              <span>Auto-Assignment Engine Evaluation Order</span>
            </h3>
            <p className="text-xs text-slate-400">
              When an email/recipient record is ingested, rules are evaluated strictly in the order below. Higher priority rules override lower rules.
            </p>
          </div>

          <div className="space-y-3">
            
            {/* Rule 1 */}
            <div className="p-4 bg-slate-950 rounded-2xl border border-sky-500/30 flex items-start gap-4">
              <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center font-bold text-sky-400">
                1
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">Rule 1: Account / Customer-Code Mapping</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    Highest Confidence (HIGH)
                  </span>
                </div>
                <p className="text-slate-400 text-xs">
                  Extracts customer code (e.g. <code className="text-sky-300 font-mono">CUST-1001</code>) from email fields, subject, body, or recipient metadata and matches against maintained lookup mapping.
                </p>
              </div>
            </div>

            {/* Rule 2 */}
            <div className="p-4 bg-slate-950 rounded-2xl border border-emerald-500/30 flex items-start gap-4">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center font-bold text-emerald-400">
                2
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">Rule 2: Direct Internal-Recipient Match</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    High Confidence (HIGH)
                  </span>
                </div>
                <p className="text-slate-400 text-xs">
                  If the email is directly addressed to an active team member's work email in <code className="text-emerald-300 font-mono">To</code> or <code className="text-emerald-300 font-mono">Cc</code>, auto-assigns ownership to that person.
                </p>
              </div>
            </div>

            {/* Rule 3 */}
            <div className="p-4 bg-slate-950 rounded-2xl border border-purple-500/30 flex items-start gap-4">
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center font-bold text-purple-400">
                3
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">Rule 3: Signature Work-Email Matching</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    High Confidence (HIGH)
                  </span>
                </div>
                <p className="text-slate-400 text-xs">
                  Parses email signatures in body for active work emails. Auto-assigns only when exact work-email match is unambiguous. Ambiguous signature matches fall back to Unassigned.
                </p>
              </div>
            </div>

            {/* Fallback */}
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex items-start gap-4">
              <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-slate-400">
                4
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">Fallback: Unassigned Queue</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                    No Match (NONE)
                  </span>
                </div>
                <p className="text-slate-400 text-xs">
                  If no trusted rule matches, the item is safely placed in the <code className="text-amber-400 font-mono">Unassigned Queue</code> for manual claim or manager assignment. No silent guessing.
                </p>
              </div>
            </div>

          </div>
        </div>

      )}

    </div>
  );
}
