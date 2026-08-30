import React, { useState } from 'react';
import { X, Send, Users, Mail, Eye, Sparkles, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

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

  if (!isOpen) return null;

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

  const parsedRecipients = parseRecipients();

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
    if (parsedRecipients.length === 0) {
      setError('Please specify at least one valid recipient email address.');
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
          recipients: parsedRecipients
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

  const selectedPreviewRecipient = parsedRecipients[previewIndex] || { name: 'Recipient Name', email: 'recipient@example.com' };
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
            Live Preview ({parsedRecipients.length} Recipient{parsedRecipients.length !== 1 ? 's' : ''})
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

              {/* Recipients Input Area */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-sky-400" />
                    Group Recipients ({parsedRecipients.length} Detected) <span className="text-red-400">*</span>
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
              {parsedRecipients.length > 0 && (
                <div className="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-800">
                  <span className="text-xs text-slate-400">Previewing Recipient {previewIndex + 1} of {parsedRecipients.length}</span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={previewIndex === 0}
                      onClick={() => setPreviewIndex(prev => Math.max(0, prev - 1))}
                      className="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded text-white"
                    >
                      Previous
                    </button>
                    <button
                      disabled={previewIndex >= parsedRecipients.length - 1}
                      onClick={() => setPreviewIndex(prev => Math.min(parsedRecipients.length - 1, prev + 1))}
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
            Sending to <span className="font-semibold text-white">{parsedRecipients.length}</span> individual recipients
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
              disabled={isSending || parsedRecipients.length === 0}
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
