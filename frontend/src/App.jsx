import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import CampaignDetail from './components/CampaignDetail';
import NewCampaignModal from './components/NewCampaignModal';
import SettingsModal from './components/SettingsModal';
import { Mail, ShieldCheck, Zap, Layers, RefreshCw } from 'lucide-react';

export default function App() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  
  // Modals
  const [isNewCampaignOpen, setIsNewCampaignOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // App settings state (mode, userEmail)
  const [appSettings, setAppSettings] = useState(null);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch('/api/campaigns');
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data);
      }
    } catch (e) {
      console.error('Error fetching campaigns:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchAppSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setAppSettings(data);
      }
    } catch (e) {
      console.error('Error fetching app settings:', e);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    fetchAppSettings();
  }, []);

  const handleCampaignCreated = (newCampaign) => {
    fetchCampaigns();
    if (newCampaign && newCampaign.campaignId) {
      setSelectedCampaignId(newCampaign.campaignId);
    }
  };

  const handleDeleteCampaign = async (id) => {
    if (!confirm('Are you sure you want to delete this campaign and all recipient logs?')) return;
    try {
      await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
      setSelectedCampaignId(null);
      fetchCampaigns();
    } catch (err) {
      console.error('Delete campaign error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans">
      
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-[#0c1220]/80 backdrop-blur-md border-b border-slate-800/80 px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          
          {/* Logo & Title */}
          <div 
            onClick={() => setSelectedCampaignId(null)} 
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 shadow-md shadow-sky-500/20 text-white group-hover:scale-105 transition-transform">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg text-white tracking-tight">MailPulse</span>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  TAT Tracker
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Gmail Group Mail Fan-out & Turnaround Analytics</p>
            </div>
          </div>

          {/* Mode Pill & Quick Settings */}
          <div className="flex items-center gap-3">
            
            {appSettings && (
              <div 
                onClick={() => setIsSettingsOpen(true)}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-medium cursor-pointer hover:border-slate-700 transition-colors"
              >
                {appSettings.mode === 'oauth' && appSettings.isConnected ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-emerald-400 font-semibold">Gmail API Active</span>
                    <span className="text-slate-500">({appSettings.userEmail})</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 text-sky-400" />
                    <span className="text-sky-300 font-semibold">Simulation Mode</span>
                    <span className="text-slate-500">(Instant Testing)</span>
                  </>
                )}
              </div>
            )}

            <button
              onClick={() => setIsNewCampaignOpen(true)}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold rounded-xl shadow-md shadow-sky-500/20 transition-all cursor-pointer"
            >
              + Create Campaign
            </button>
          </div>

        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8">
        {selectedCampaignId ? (
          <CampaignDetail
            campaignId={selectedCampaignId}
            onBack={() => {
              setSelectedCampaignId(null);
              fetchCampaigns();
            }}
            onDeleteCampaign={handleDeleteCampaign}
          />
        ) : (
          <Dashboard
            campaigns={campaigns}
            loading={loading}
            onRefresh={fetchCampaigns}
            onSelectCampaign={(id) => setSelectedCampaignId(id)}
            onOpenNewCampaignModal={() => setIsNewCampaignOpen(true)}
            onOpenSettingsModal={() => setIsSettingsOpen(true)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 bg-[#090d16] py-6 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>MailPulse &copy; 2026 — Google Mail API Group Email Fan-Out & TAT Tracker</span>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Open TAT = (First Opened At - Sent At)</span>
            <span>•</span>
            <span>Reply TAT = (First Replied At - Sent At)</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <NewCampaignModal
        isOpen={isNewCampaignOpen}
        onClose={() => setIsNewCampaignOpen(false)}
        onCampaignCreated={handleCampaignCreated}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => {
          setIsSettingsOpen(false);
          fetchAppSettings();
        }}
      />

    </div>
  );
}
