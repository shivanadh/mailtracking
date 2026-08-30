import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, Key, Globe, CheckCircle2, AlertCircle, ExternalLink, Zap } from 'lucide-react';

export default function SettingsModal({ isOpen, onClose }) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState('http://localhost:5000/api/auth/google/callback');
  const [mode, setMode] = useState('simulation');
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setClientId(data.clientId || '');
      setRedirectUri(data.redirectUri || 'http://localhost:5000/api/auth/google/callback');
      setMode(data.mode || 'simulation');
      setStatus(data);
    } catch (err) {
      console.error('Failed fetching settings:', err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret, redirectUri, mode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed saving settings');
      setMessage({ type: 'success', text: 'Settings updated successfully!' });
      await fetchSettings();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleConnectGoogle = async () => {
    try {
      const res = await fetch('/api/auth/google/url');
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Could not generate Google Auth URL. Please save Client ID & Secret first.');
      }
    } catch (err) {
      alert(`OAuth Error: ${err.message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#111827] border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Google Mail API & Tracking Settings</h2>
              <p className="text-xs text-slate-400">Configure real Gmail OAuth2 credentials or instant Simulation mode</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
          
          {message && (
            <div className={`p-3.5 rounded-xl text-xs flex items-center gap-2 border ${
              message.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                : 'bg-red-500/10 text-red-300 border-red-500/30'
            }`}>
              {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{message.text}</span>
            </div>
          )}

          {/* Operation Mode Selector */}
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Active Sending Mode
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('simulation')}
                className={`p-3.5 rounded-xl text-left border transition-all ${
                  mode === 'simulation'
                    ? 'bg-sky-500/10 border-sky-500/40 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between font-semibold text-sm">
                  <span>Simulation Mode</span>
                  <Zap className="w-4 h-4 text-sky-400" />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Instant zero-config testing. Mocks Gmail delivery so you can simulate opens, replies, & TAT.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode('oauth')}
                className={`p-3.5 rounded-xl text-left border transition-all ${
                  mode === 'oauth'
                    ? 'bg-sky-500/10 border-sky-500/40 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between font-semibold text-sm">
                  <span>Real Gmail API (OAuth2)</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Uses Google Workspace / Gmail API to send real emails to recipient inboxes.
                </p>
              </button>
            </div>
          </div>

          {/* Connection Status Box */}
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs text-slate-400 font-medium">Google Account Connection Status</div>
              {status?.isConnected ? (
                <div className="text-sm font-semibold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Connected as {status.userEmail}
                </div>
              ) : (
                <div className="text-sm font-semibold text-amber-400 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" /> Not Connected (Using Simulation Mode)
                </div>
              )}
            </div>

            <button
              onClick={handleConnectGoogle}
              className="px-4 py-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-md shadow-sky-500/20"
            >
              <span>Connect Google Account</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* OAuth Form */}
          <div className="space-y-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Key className="w-3.5 h-3.5 text-sky-400" /> Google Cloud Console Credentials
            </h4>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Google OAuth Client ID</label>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="xxxxxxxxx-xxxxxxxxxx.apps.googleusercontent.com"
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Google OAuth Client Secret</label>
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={status?.hasClientSecret ? '••••••••••••••••' : 'GOCSPX-xxxxxxxxxxxxxx'}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Authorized Redirect URI</label>
              <input
                type="text"
                value={redirectUri}
                onChange={(e) => setRedirectUri(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/70 rounded-xl px-3.5 py-2.5 text-xs text-slate-300 font-mono focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <span className="text-xs text-slate-500">Backend Port: 5000</span>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 text-xs text-slate-400 hover:text-white">
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold rounded-xl"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
