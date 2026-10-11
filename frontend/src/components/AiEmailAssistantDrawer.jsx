import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  X,
  RefreshCw,
  Send,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  ChevronRight,
  ShieldCheck,
  Wand2,
  FileEdit,
  ArrowRight,
  HelpCircle,
  Sliders,
  History,
  RotateCcw
} from 'lucide-react';

const PURPOSE_OPTIONS = [
  { value: '', label: 'General / Standard Communication' },
  { value: 'Request Information', label: 'Request Information' },
  { value: 'Follow-up', label: 'Follow-up' },
  { value: 'Reminder', label: 'Reminder' },
  { value: 'Announcement', label: 'Announcement' },
  { value: 'Escalation', label: 'Escalation' },
  { value: 'Custom', label: 'Custom Purpose...' }
];

const TONE_OPTIONS = [
  { value: 'Professional', label: 'Professional' },
  { value: 'Friendly', label: 'Friendly' },
  { value: 'Formal', label: 'Formal' },
  { value: 'Firm', label: 'Firm' }
];

const LENGTH_OPTIONS = [
  { value: 'Short', label: 'Short (Concise & Direct)' },
  { value: 'Medium', label: 'Medium (Balanced)' },
  { value: 'Detailed', label: 'Detailed (Comprehensive)' }
];

const LANGUAGE_OPTIONS = [
  'English',
  'Spanish',
  'French',
  'German',
  'Japanese',
  'Portuguese',
  'Hindi',
  'Italian',
  'Dutch'
];

export default function AiEmailAssistantDrawer({
  isOpen,
  onClose,
  onApplyDraft,
  initialSubject = '',
  initialBody = '',
  defaultSender = ''
}) {
  // Input fields for generation
  const [context, setContext] = useState('');
  const [purpose, setPurpose] = useState('');
  const [customPurpose, setCustomPurpose] = useState('');
  const [tone, setTone] = useState('Professional');
  const [length, setLength] = useState('Medium');
  const [language, setLanguage] = useState('English');
  const [senderSignature, setSenderSignature] = useState(defaultSender || '');
  const [requiredFacts, setRequiredFacts] = useState('');
  const [deadline, setDeadline] = useState('');
  const [callToAction, setCallToAction] = useState('');

  // Active editable draft state
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [suggestedDetails, setSuggestedDetails] = useState([]);

  // Regeneration comparison candidate state
  const [candidateDraft, setCandidateDraft] = useState(null);

  // Revision state
  const [revisionInstructions, setRevisionInstructions] = useState('');

  // Loading, error, and status states
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRevising, setIsRevising] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [aiStatus, setAiStatus] = useState({ isConfigured: true, model: 'gemini-2.5-flash' });

  // Outdated response tracking
  const requestSeqRef = useRef(0);

  // Check backend Gemini status on mount/open
  useEffect(() => {
    if (isOpen) {
      checkAiStatus();
      if (!draftSubject && initialSubject) {
        setDraftSubject(initialSubject);
      }
      if (!draftBody && initialBody) {
        setDraftBody(initialBody);
      }
    }
  }, [isOpen]);

  const checkAiStatus = async () => {
    try {
      const res = await fetch('/api/ai/status');
      if (res.ok) {
        const data = await res.json();
        setAiStatus(data);
      }
    } catch (e) {
      // ignore status check failure
    }
  };

  if (!isOpen) return null;

  // Handle Initial Generation or Full Regeneration
  const handleGenerate = async (isRegeneration = false) => {
    if (!context.trim()) {
      setError('Please provide background context or situation description for the email.');
      return;
    }

    if (context.length > 4000) {
      setError('Context length exceeds maximum limit of 4,000 characters.');
      return;
    }

    const currentSeq = ++requestSeqRef.current;
    setError(null);
    setIsGenerating(true);

    try {
      const selectedPurpose = purpose === 'Custom' ? customPurpose.trim() : purpose;

      const res = await fetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'generate',
          context: context.trim(),
          purpose: selectedPurpose || undefined,
          tone,
          length,
          language,
          senderSignature: senderSignature.trim() || undefined,
          requiredFacts: requiredFacts.trim() || undefined,
          deadline: deadline.trim() || undefined,
          callToAction: callToAction.trim() || undefined
        })
      });

      const data = await res.json();

      // Guard against outdated responses
      if (currentSeq !== requestSeqRef.current) return;

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate email draft.');
      }

      if (isRegeneration && draftBody.trim()) {
        // If current draft already exists, show new version in candidate comparison card
        setCandidateDraft({
          subject: data.draft.subject,
          body: data.draft.body,
          suggestedDetailsToConfirm: data.draft.suggestedDetailsToConfirm || []
        });
      } else {
        // First draft generation
        setDraftSubject(data.draft.subject);
        setDraftBody(data.draft.body);
        setSuggestedDetails(data.draft.suggestedDetailsToConfirm || []);
        setCandidateDraft(null);
      }
    } catch (err) {
      // Guard against outdated response error
      if (currentSeq !== requestSeqRef.current) return;
      setError(err.message);
      // Preserves existing draft and edits!
    } finally {
      if (currentSeq === requestSeqRef.current) {
        setIsGenerating(false);
      }
    }
  };

  // Handle Revision of Current Edited Draft
  const handleRevise = async () => {
    if (!draftBody.trim()) {
      setError('Cannot revise an empty draft. Please generate or enter draft content first.');
      return;
    }

    if (!revisionInstructions.trim()) {
      setError('Please enter revision instructions (e.g. "Make it shorter", "Use a more polite tone").');
      return;
    }

    if (revisionInstructions.length > 1000) {
      setError('Revision instructions exceed maximum limit of 1,000 characters.');
      return;
    }

    const currentSeq = ++requestSeqRef.current;
    setError(null);
    setIsRevising(true);

    try {
      const res = await fetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'revise',
          context: context.trim() || undefined,
          currentSubject: draftSubject.trim(),
          currentBody: draftBody.trim(),
          revisionInstructions: revisionInstructions.trim(),
          tone,
          length,
          language,
          senderSignature: senderSignature.trim() || undefined
        })
      });

      const data = await res.json();

      // Guard against outdated responses
      if (currentSeq !== requestSeqRef.current) return;

      if (!res.ok) {
        throw new Error(data.error || 'Failed to revise email draft.');
      }

      // Show revision as candidate to allow user to accept or keep current version
      setCandidateDraft({
        subject: data.draft.subject,
        body: data.draft.body,
        suggestedDetailsToConfirm: data.draft.suggestedDetailsToConfirm || []
      });
      setRevisionInstructions('');
    } catch (err) {
      if (currentSeq !== requestSeqRef.current) return;
      setError(err.message);
      // Preserves existing draft and edits on failure!
    } finally {
      if (currentSeq === requestSeqRef.current) {
        setIsRevising(false);
      }
    }
  };

  // Accept Candidate Version
  const handleAcceptCandidate = () => {
    if (!candidateDraft) return;
    setDraftSubject(candidateDraft.subject);
    setDraftBody(candidateDraft.body);
    if (candidateDraft.suggestedDetailsToConfirm) {
      setSuggestedDetails(candidateDraft.suggestedDetailsToConfirm);
    }
    setCandidateDraft(null);
  };

  // Discard Candidate Version
  const handleDiscardCandidate = () => {
    setCandidateDraft(null);
  };

  // Apply to Campaign Composer
  const handleApply = () => {
    if (!draftSubject.trim() && !draftBody.trim()) {
      setError('Cannot apply an empty draft to the composer.');
      return;
    }
    onApplyDraft({
      subject: draftSubject.trim(),
      body: draftBody.trim(),
      suggestedDetails
    });
    onClose();
  };

  const handleCopy = () => {
    const fullText = `Subject: ${draftSubject}\n\n${draftBody}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isBusy = isGenerating || isRevising;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="bg-[#0f172a] border border-slate-700/80 rounded-2xl w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-purple-600 to-sky-500 shadow-md shadow-purple-500/25 text-white">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Gemini AI Email Assistant</h2>
                <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {aiStatus.model || 'Gemini 2.5'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Transform notes and situation context into polished, editable email campaigns
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!aiStatus.isConfigured && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                <AlertCircle className="w-3.5 h-3.5" />
                API Key Not Configured on Server
              </span>
            )}
            <button
              onClick={onClose}
              disabled={isBusy}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-red-500/15 border border-red-500/35 text-red-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleGenerate(Boolean(draftBody.trim()))}
                disabled={isBusy || !context.trim()}
                className="px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-100 text-[11px] font-semibold border border-red-500/30 transition-colors cursor-pointer"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium border border-slate-700 transition-colors cursor-pointer"
              >
                Compose Manually
              </button>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-xs text-red-400 hover:text-red-200 cursor-pointer ml-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Main Content Layout: Two columns on desktop */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT COLUMN: Input Context & Parameters (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            
            {/* Context & Situation Box */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <FileEdit className="w-3.5 h-3.5 text-purple-400" />
                  Situation / Context <span className="text-red-400">*</span>
                </label>
                <span className={`text-[11px] font-mono ${context.length > 4000 ? 'text-red-400 font-bold' : 'text-slate-400'}`}>
                  {context.length} / 4000
                </span>
              </div>
              <textarea
                rows={5}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Describe the situation, background, key updates, or paste raw notes here... e.g., 'We need all regional leads to submit their Q3 operational expenses and headcount reviews before Friday 5 PM.'"
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 font-sans focus:outline-none focus:border-purple-500 transition-colors custom-scrollbar"
              />
              <p className="text-[11px] text-slate-400">
                Be specific about what you need communicated. Gemini will turn this into a structured draft.
              </p>
            </div>

            {/* Purpose & Tone Parameters */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3.5">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-sky-400" />
                Parameters & Styling
              </div>

              {/* Purpose Selection */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Purpose / Goal (Optional)
                </label>
                <select
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  {PURPOSE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {purpose === 'Custom' && (
                  <input
                    type="text"
                    value={customPurpose}
                    onChange={(e) => setCustomPurpose(e.target.value)}
                    placeholder="Enter custom purpose (e.g. Budget Negotiation)"
                    className="mt-2 w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                )}
              </div>

              {/* Tone & Length in 2 cols */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Tone
                  </label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    {TONE_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Length
                  </label>
                  <select
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    {LENGTH_OPTIONS.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Language & Sender */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Language
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    {LANGUAGE_OPTIONS.map((lang) => (
                      <option key={lang} value={lang}>{lang}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Sender Name / Signature
                  </label>
                  <input
                    type="text"
                    value={senderSignature}
                    onChange={(e) => setSenderSignature(e.target.value)}
                    placeholder="e.g. Operations Team"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Optional Facts, Deadline, CTA */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Required Facts / Numbers (Optional)
                  </label>
                  <input
                    type="text"
                    value={requiredFacts}
                    onChange={(e) => setRequiredFacts(e.target.value)}
                    placeholder="e.g. Target reduction 15%, Section 4 compliance"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Deadline (Optional)
                    </label>
                    <input
                      type="text"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                      placeholder="e.g. Friday by 5:00 PM EST"
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Call to Action (Optional)
                    </label>
                    <input
                      type="text"
                      value={callToAction}
                      onChange={(e) => setCallToAction(e.target.value)}
                      placeholder="e.g. Reply with signed attachment"
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Privacy & Safety Note */}
            <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 text-[11px] text-purple-200/80 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <span>
                <strong>Privacy Guarantee:</strong> Only the context and options you supply above are sent to Gemini. Your inbox messages, mailbox contents, and recipient fan-out lists are never transmitted.
              </span>
            </div>

            {/* Generate Action Button */}
            <button
              onClick={() => handleGenerate(Boolean(draftBody.trim()))}
              disabled={isBusy || !context.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-purple-600 via-indigo-600 to-sky-600 hover:from-purple-500 hover:to-sky-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-600/25 transition-all cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Generating Draft with Gemini...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  <span>{draftBody.trim() ? 'Regenerate Email Draft' : 'Generate Email Draft'}</span>
                </>
              )}
            </button>

          </div>

          {/* RIGHT COLUMN: Editable Draft, Regeneration Comparison & Revisions (7 cols) */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            
            {/* Candidate Version Comparison Card (Requirement 3) */}
            {candidateDraft && (
              <div className="p-4 bg-gradient-to-r from-purple-950/70 to-slate-900 border-2 border-purple-500/50 rounded-2xl shadow-xl space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded-lg bg-purple-500/20 text-purple-300">
                      <Sparkles className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      New Candidate Version Generated
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleAcceptCandidate}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Use New Version
                    </button>
                    <button
                      onClick={handleDiscardCandidate}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 transition-all cursor-pointer"
                    >
                      Keep Current Version
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 space-y-2">
                  <div className="text-xs text-sky-300 font-semibold">
                    <span className="text-slate-500 mr-2">Subject:</span>
                    {candidateDraft.subject}
                  </div>
                  <div className="text-xs text-slate-200 font-sans whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar leading-relaxed">
                    {candidateDraft.body}
                  </div>
                </div>
              </div>
            )}

            {/* Active Editable Draft Area */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex-1 flex flex-col space-y-3.5 shadow-md">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-white">
                    Current Active Draft
                  </span>
                  {draftBody.trim() && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Editable
                    </span>
                  )}
                </div>
                {draftBody.trim() && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-1 transition-colors"
                      title="Copy subject and body to clipboard"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Editable Subject */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Draft Subject Line <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={draftSubject}
                  onChange={(e) => setDraftSubject(e.target.value)}
                  placeholder="Subject will appear here after generation..."
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Editable Body */}
              <div className="flex-1 flex flex-col">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Draft Email Body <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={10}
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  placeholder="Generated email body will appear here. You can freely edit any paragraph, add bullet points, or insert template tags like {{name}} and {{email}}."
                  className="w-full flex-1 min-h-[220px] bg-slate-950 border border-slate-700/80 rounded-xl p-3.5 text-xs text-slate-100 placeholder-slate-500 font-sans focus:outline-none focus:border-purple-500 custom-scrollbar leading-relaxed"
                />
              </div>

              {/* Suggested Details to Confirm Box */}
              {suggestedDetails.length > 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1.5">
                  <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Details to Confirm Before Sending:
                  </div>
                  <ul className="text-[11px] text-amber-200/90 list-disc list-inside space-y-0.5">
                    {suggestedDetails.map((detail, idx) => (
                      <li key={idx}>{detail}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Revision Instructions Area (Requirement 2 & 3) */}
              {draftBody.trim() && (
                <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />
                      Request Revision on Current Draft
                    </label>
                    <span className="text-[10px] text-slate-500">
                      Based on your latest edits
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={revisionInstructions}
                      onChange={(e) => setRevisionInstructions(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isBusy && revisionInstructions.trim()) {
                          handleRevise();
                        }
                      }}
                      placeholder="e.g. 'Make it shorter', 'Add bullet points for deliverables', 'More diplomatic tone'..."
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleRevise}
                      disabled={isBusy || !revisionInstructions.trim()}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                    >
                      {isRevising ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Revising...</span>
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-3.5 h-3.5" />
                          <span>Revise Draft</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

            </div>

          </div>

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {draftBody.trim() ? (
              <span className="text-emerald-400 flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Draft ready. Click "Apply to Campaign" to insert into composer.
              </span>
            ) : (
              <span>Provide context and click "Generate Email Draft" to start.</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isBusy}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={isBusy || (!draftSubject.trim() && !draftBody.trim())}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-sky-600 hover:from-purple-500 hover:to-sky-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-600/25 transition-all cursor-pointer"
            >
              <span>Apply to Campaign Composer</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
