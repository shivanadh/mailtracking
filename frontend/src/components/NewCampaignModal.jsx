import React, { useState, useEffect } from 'react';
import { X, Send, Users, Mail, Eye, Sparkles, FileText, CheckCircle2, AlertCircle, Building2, ChevronDown, ChevronUp } from 'lucide-react';

export default function NewCampaignModal({ isOpen, onClose, onCampaignCreated }) {
  const [subject, setSubject] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState(
    'Hi {{name}},\n\nHere is the update regarding our team deliverables and key milestones.\n\nPlease review and reply back to confirm your status.\n\nBest regards,\nAdmin Team'
  );
  const [rawRecipients, setRawRecipients] = useState(
    'alex@example.com (Alex Rivera)\nsarah@example.com (Sarah Chen)\nteam-lead@company.com (David Miller)\njohn.doe@acme.org (John Doe)'
  );
  const [activeTab, setActiveTab] = useState('compose'); // compose or preview
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);

  // Department selection state
  const [departments, setDepartments] = useState([]);
  const [selectedDeptIds, setSelectedDeptIds] = useState([]);
  const [deptParticipants, setDeptParticipants] = useState({}); // deptId -> participants[]
  const [showDeptSection, setShowDeptSection] = useState(false);
  const [loadingDepts, setLoadingDepts] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchDepartments();
    }
  }, [isOpen]);

  const fetchDepartments = async () => {
    setLoadingDepts(true);
    try {
      const res = await fetch('/api/departments?status=active');
      if (res.ok) {
        const data = await res.json();
        setDepartments(data);
        // Pre-fetch participants for all departments
        const participantMap = {};
        for (const dept of data) {
          try {
            const pRes = await fetch(`/api/departments/${dept.id}/participants`);
            if (pRes.ok) {
              participantMap[dept.id] = (await pRes.json()).filter(p => p.status === 'active');
            }
          } catch (e) { /* skip */ }
        }
        setDeptParticipants(participantMap);
      }
    } catch (e) {
      console.error('Failed to fetch departments:', e);
    } finally {
      setLoadingDepts(false);
    }
  };

  if (!isOpen) return null;

  // Toggle department selection
  const toggleDept = (deptId) => {
    setSelectedDeptIds(prev =>
      prev.includes(deptId) ? prev.filter(id => id !== deptId) : [...prev, deptId]
    );
  };

  const toggleAllDepts = () => {
    if (selectedDeptIds.length === departments.length) {
      setSelectedDeptIds([]);
    } else {
      setSelectedDeptIds(departments.map(d => d.id));
    }
  };

  // Get participants from selected departments
  const getDeptRecipients = () => {
    const seen = new Set();
    const result = [];
    for (const deptId of selectedDeptIds) {
      const participants = deptParticipants[deptId] || [];
      for (const p of participants) {
        const key = p.email.toLowerCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          result.push({ email: p.email, name: p.name, fromDept: true });
        }
      }
    }
    return result;
  };

  // Parse email strings into structured recipients list
  const parseRecipients = () => {
    const lines = rawRecipients.split(/[\n,;]+/);
    const parsed = [];

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      // Check if format is "email (Name)" or "Name <email>" or simple "email"
      let email = '';
      let name = '';

      const angleMatch = line.match(/(.*)<([^>]+)>/);
      const parenMatch = line.match(/([^\s@]+@[^\s@]+\.[^\s@]+)\s*\(([^)]+)\)/);

      if (angleMatch) {
        name = angleMatch[1].trim();
        email = angleMatch[2].trim();
      } else if (parenMatch) {
        email = parenMatch[1].trim();
        name = parenMatch[2].trim();
      } else {
        email = line.replace(/[^a-zA-Z0-9@._+-]/g, '').trim();
        if (email.includes('@')) {
          name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
      }

      if (email && email.includes('@')) {
        parsed.push({ email, name: name || email.split('@')[0] });
      }
    }
    return parsed;
  };

  const manualRecipients = parseRecipients();
  const deptRecipients = getDeptRecipients();

  // Deduplicated combined list
  const getCombinedRecipients = () => {
    const seen = new Set();
    const combined = [];

    // Department recipients first
    for (const r of deptRecipients) {
      const key = r.email.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(r);
      }
    }

    // Then manual recipients
    for (const r of manualRecipients) {
      const key = r.email.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        combined.push({ ...r, fromDept: false });
      }
    }

    return combined;
  };

  const combinedRecipients = getCombinedRecipients();

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setRawRecipients(event.target.result);
    };
    reader.readAsText(file);
  };

  const insertVariable = (varName) => {
    setBody(prev => prev + ` {{${varName}}}`);
  };

  const handleSend = async () => {
    if (!subject.trim()) {
      setError('Please provide a campaign subject.');
      return;
    }
    if (!body.trim()) {
      setError('Email body content cannot be empty.');
      return;
    }
    if (combinedRecipients.length === 0) {
      setError('Please specify at least one valid recipient email address or select departments with active participants.');
      return;
    }

    setError(null);
    setIsSending(true);

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || subject.trim(),
          subject: subject.trim(),
          body: body.trim(),
          recipients: manualRecipients,
          departmentIds: selectedDeptIds.length > 0 ? selectedDeptIds : undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send campaign');
      }

      onCampaignCreated(data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSending(false);
    }
  };

  const selectedPreviewRecipient = combinedRecipients[previewIndex] || { name: 'Recipient Name', email: 'recipient@example.com' };
  const previewBody = body
    .replace(/\{\{\s*name\s*\}\}/gi, selectedPreviewRecipient.name)
    .replace(/\{\{\s*email\s*\}\}/gi, selectedPreviewRecipient.email);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#111827] border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Compose Group Mail Campaign</h2>
              <p className="text-xs text-slate-400">Individual recipient fan-out with per-person TAT tracking</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 pt-2">
          <button
            onClick={() => setActiveTab('compose')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'compose'
                ? 'border-sky-400 text-sky-400 bg-sky-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Campaign Composer
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'preview'
                ? 'border-sky-400 text-sky-400 bg-sky-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye className="w-4 h-4" />
            Live Preview ({combinedRecipients.length} Recipient{combinedRecipients.length !== 1 ? 's' : ''})
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'compose' ? (
            <>
              {/* Campaign Title & Subject */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Campaign Internal Label
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Q3 Project Milestone Check-in"
                    className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Email Subject Line <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Action Required: Team Status & Deliverables"
                    className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
                  />
                </div>
              </div>

              {/* Department Selection */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowDeptSection(!showDeptSection)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Send to Departments
                    </span>
                    {selectedDeptIds.length > 0 && (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                        {selectedDeptIds.length} selected · {deptRecipients.length} participants
                      </span>
                    )}
                  </div>
                  {showDeptSection ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>

                {showDeptSection && (
                  <div className="px-4 pb-4 border-t border-slate-800">
                    {loadingDepts ? (
                      <div className="py-4 text-center text-slate-500 text-sm">Loading departments...</div>
                    ) : departments.length === 0 ? (
                      <div className="py-4 text-center text-slate-500 text-sm">No active departments available. Create departments first.</div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between py-2">
                          <span className="text-xs text-slate-400">Select departments to include their active participants as recipients</span>
                          <button
                            onClick={toggleAllDepts}
                            className="text-xs text-sky-400 hover:text-sky-300 font-medium"
                          >
                            {selectedDeptIds.length === departments.length ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {departments.map(dept => {
                            const isSelected = selectedDeptIds.includes(dept.id);
                            const pCount = (deptParticipants[dept.id] || []).length;
                            return (
                              <button
                                key={dept.id}
                                onClick={() => toggleDept(dept.id)}
                                className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                                  isSelected
                                    ? 'bg-indigo-500/10 border-indigo-500/30 text-white'
                                    : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${isSelected ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600'}`}>
                                    {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                                  </div>
                                  <div>
                                    <div className="text-sm font-medium">{dept.name}</div>
                                    {dept.description && <div className="text-[11px] text-slate-500">{dept.description}</div>}
                                  </div>
                                </div>
                                <span className="text-xs text-slate-400 shrink-0 ml-2">{pCount} member{pCount !== 1 ? 's' : ''}</span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Department Recipients Preview */}
                        {selectedDeptIds.length > 0 && deptRecipients.length > 0 && (
                          <div className="mt-3 p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                            <div className="text-xs font-semibold text-indigo-400 mb-1.5">
                              {deptRecipients.length} unique participant{deptRecipients.length !== 1 ? 's' : ''} from selected departments:
                            </div>
                            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto custom-scrollbar">
                              {deptRecipients.map((r, i) => (
                                <span key={i} className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[11px] rounded-lg">{r.name} &lt;{r.email}&gt;</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Recipients Input Area */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-sky-400" />
                    Manual Recipients ({manualRecipients.length} Detected)
                  </label>
                  <label className="text-xs text-sky-400 hover:text-sky-300 cursor-pointer flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    Import CSV/TXT
                    <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
                <textarea
                  rows={4}
                  value={rawRecipients}
                  onChange={(e) => setRawRecipients(e.target.value)}
                  placeholder="Enter emails separated by comma or new lines, e.g. alex@company.com (Alex Rivera)"
                  className="w-full bg-slate-900 border border-slate-700/70 rounded-xl p-3.5 text-sm text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-sky-500 transition-colors custom-scrollbar"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Supported formats: <code className="text-sky-400">email@example.com</code> or <code className="text-sky-400">email@example.com (Full Name)</code> or <code className="text-sky-400">Full Name &lt;email@example.com&gt;</code>
                </p>
              </div>

              {/* Combined Recipient Summary */}
              {(selectedDeptIds.length > 0 && manualRecipients.length > 0) && (
                <div className="p-3.5 rounded-xl bg-sky-500/5 border border-sky-500/20 text-sm">
                  <div className="flex items-center gap-2 text-sky-400 font-semibold text-xs mb-1">
                    <Users className="w-3.5 h-3.5" />
                    Combined Recipient Preview (deduplicated)
                  </div>
                  <div className="text-slate-300 text-xs">
                    <span className="text-indigo-400 font-medium">{deptRecipients.length}</span> from departments +{' '}
                    <span className="text-sky-400 font-medium">{combinedRecipients.length - deptRecipients.length}</span> manual ={' '}
                    <span className="text-white font-bold">{combinedRecipients.length}</span> total unique recipients
                  </div>
                </div>
              )}

              {/* Email Content Body */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Email Body HTML / Plain Text <span className="text-red-400">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">Insert Variable:</span>
                    <button
                      type="button"
                      onClick={() => insertVariable('name')}
                      className="px-2 py-0.5 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 rounded"
                    >
                      + Name
                    </button>
                    <button
                      type="button"
                      onClick={() => insertVariable('email')}
                      className="px-2 py-0.5 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 rounded"
                    >
                      + Email
                    </button>
                  </div>
                </div>
                <textarea
                  rows={6}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/70 rounded-xl p-3.5 text-sm text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-sky-500 transition-colors custom-scrollbar"
                />
              </div>
            </>
          ) : (
            /* Live Preview Tab */
            <div className="space-y-4">
              {combinedRecipients.length > 0 && (
                <div className="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-800">
                  <span className="text-xs text-slate-400">Previewing Recipient {previewIndex + 1} of {combinedRecipients.length}</span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={previewIndex === 0}
                      onClick={() => setPreviewIndex(prev => Math.max(0, prev - 1))}
                      className="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded text-white"
                    >
                      Previous
                    </button>
                    <button
                      disabled={previewIndex >= combinedRecipients.length - 1}
                      onClick={() => setPreviewIndex(prev => Math.min(combinedRecipients.length - 1, prev + 1))}
                      className="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded text-white"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}

              {/* Email Envelope Container */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="border-b border-slate-800/80 pb-3 space-y-1.5 text-sm">
                  <div className="flex"><span className="w-20 text-slate-500 font-medium">To:</span> <span className="text-slate-200 font-semibold">{selectedPreviewRecipient.name} &lt;{selectedPreviewRecipient.email}&gt;</span></div>
                  <div className="flex"><span className="w-20 text-slate-500 font-medium">Subject:</span> <span className="text-sky-400 font-medium">{subject || '(No Subject)'}</span></div>
                  {selectedPreviewRecipient.fromDept && (
                    <div className="flex"><span className="w-20 text-slate-500 font-medium">Source:</span> <span className="text-indigo-400 text-xs font-medium">From Department</span></div>
                  )}
                </div>
                
                <div className="pt-2 text-slate-200 whitespace-pre-wrap text-sm leading-relaxed font-sans min-h-[140px]">
                  {previewBody}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Invisible 1x1 TAT tracking pixel will be automatically embedded.
                  </div>
                  <span>Header: X-MailTrack-ID</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Sending to <span className="font-semibold text-white">{combinedRecipients.length}</span> individual recipients
            {selectedDeptIds.length > 0 && (
              <span className="text-indigo-400 ml-1">
                ({selectedDeptIds.length} dept{selectedDeptIds.length !== 1 ? 's' : ''})
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isSending}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={isSending || combinedRecipients.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-lg shadow-sky-500/20 transition-all cursor-pointer"
            >
              {isSending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Fanning Out Emails...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Send Campaign Now</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

