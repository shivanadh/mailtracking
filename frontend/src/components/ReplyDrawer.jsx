import React, { useState, useEffect } from 'react';
import { 
  X, MessageSquare, Clock, User, Mail, RefreshCw, AlertCircle, 
  CheckCircle2, ChevronRight, FileText, Sparkles 
} from 'lucide-react';

export default function ReplyDrawer({
  isOpen,
  onClose,
  recipientId
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchingGmail, setFetchingGmail] = useState(false);
  const [error, setError] = useState(null);
  const [selectedReplyIndex, setSelectedReplyIndex] = useState(0);

  const fetchReplyData = async () => {
    if (!recipientId || !isOpen) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/recipients/${recipientId}/reply`);
      if (!res.ok) throw new Error('Failed to load recipient reply content');
      const result = await res.json();
      setData(result);
    } catch (err) {
      console.error('Error fetching reply:', err);
      setError(err.message || 'Failed to fetch reply details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && recipientId) {
      setSelectedReplyIndex(0);
      fetchReplyData();
    }
  }, [isOpen, recipientId]);

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

  const handleFetchGmailReplyOnDemand = async () => {
    if (!recipientId) return;
    setFetchingGmail(true);
    try {
      const res = await fetch(`/api/recipients/${recipientId}/fetch-reply`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to fetch reply from Gmail API');
      const result = await res.json();
      if (result.latest_reply) {
        await fetchReplyData();
      } else {
        setError('Reply message content is not available yet in Gmail thread.');
      }
    } catch (err) {
      setError(err.message || 'Error syncing message content from Gmail');
    } finally {
      setFetchingGmail(false);
    }
  };

  if (!isOpen) return null;

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      return new Date(isoString).toLocaleString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  const latestReply = data?.latest_reply;
  const repliesList = data?.replies || [];
  const currentReply = repliesList[selectedReplyIndex] || latestReply;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-fade-in">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6">
        <div className="w-screen max-w-2xl bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col">
          
          {/* Drawer Header */}
          <div className="p-6 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Recipient Reply Message</span>
                  {data?.status === 'REPLIED' && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Replied
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5 truncate max-w-md">
                  Campaign: <span className="text-slate-200 font-medium">{data?.campaign_subject || 'Loading...'}</span>
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

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
                <RefreshCw className="w-7 h-7 animate-spin text-emerald-400" />
                <span className="text-xs font-medium">Fetching recipient reply message...</span>
              </div>
            ) : error ? (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-300 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-rose-400">
                  <AlertCircle className="w-4 h-4" />
                  <span>Unable to display reply content</span>
                </div>
                <p>{error}</p>
                <button
                  onClick={fetchReplyData}
                  className="mt-2 px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Retry Loading
                </button>
              </div>
            ) : !data?.has_reply ? (
              <div className="p-12 text-center bg-slate-950/40 rounded-2xl border border-slate-800/60 space-y-3">
                <Mail className="w-10 h-10 text-slate-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-300">No Reply Detected Yet</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Recipient ({data?.email}) has not sent a response to this campaign yet.
                </p>
              </div>
            ) : !data?.body_available ? (
              <div className="p-6 bg-slate-950/60 rounded-2xl border border-amber-500/20 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Reply Content Pending</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      A reply was detected, but its message content is not available yet.
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-mono">
                    Thread ID: {data?.gmail_thread_id || 'N/A'}
                  </span>
                  <button
                    onClick={handleFetchGmailReplyOnDemand}
                    disabled={fetchingGmail}
                    className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${fetchingGmail ? 'animate-spin' : ''}`} />
                    <span>{fetchingGmail ? 'Loading from Gmail...' : 'Load reply message'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                
                {/* Recipient Metadata Card */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
                        {(currentReply?.sender_name || data.name || data.email)[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white flex items-center gap-2">
                          <span>Replied by: {currentReply?.sender_name || data.name || 'Recipient'}</span>
                        </div>
                        <div className="text-xs text-slate-400 font-mono">{currentReply?.sender_email || data.email}</div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>TAT: {data.tat_reply_formatted}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {formatDate(currentReply?.received_at || data.first_replied_at)}
                      </div>
                    </div>
                  </div>

                  {/* Campaign & Thread Details */}
                  <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Recipient Contact</span>
                      <span className="text-slate-200 font-medium truncate block">{data.name} ({data.email})</span>
                    </div>
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Sent Date</span>
                      <span className="text-slate-200 font-medium truncate block">{formatDate(data.sent_at)}</span>
                    </div>
                  </div>
                </div>

                {/* Reply Message Tabs if multiple replies exist */}
                {repliesList.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-800">
                    <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider shrink-0 mr-1">
                      Replies ({repliesList.length}):
                    </span>
                    {repliesList.map((rep, idx) => (
                      <button
                        key={rep.id || idx}
                        onClick={() => setSelectedReplyIndex(idx)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer ${
                          selectedReplyIndex === idx
                            ? 'bg-emerald-500 text-slate-950 font-bold'
                            : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        {idx === 0 ? 'Latest Reply' : `Reply #${repliesList.length - idx}`}
                      </button>
                    ))}
                  </div>
                )}

                {/* Message Body Panel */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <FileText className="w-3.5 h-3.5" /> Message Content
                    </span>
                    <span className="text-slate-500 text-[11px] font-normal">Sanitized Plain Text</span>
                  </div>

                  <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-5 shadow-inner">
                    <pre className="whitespace-pre-wrap font-sans text-sm text-slate-200 leading-relaxed selection:bg-emerald-500 selection:text-slate-950">
                      {currentReply?.body_text || currentReply?.snippet || 'No message content available.'}
                    </pre>
                  </div>
                </div>

              </div>
            )}

          </div>

          {/* Drawer Footer */}
          <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
            <span>MailPulse Reply Inspector</span>
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
