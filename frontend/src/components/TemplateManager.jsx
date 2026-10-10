import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Search, Edit2, Trash2, FileText, Copy, Archive } from 'lucide-react';

export default function TemplateManager({ onBack }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [isEditing, setIsEditing] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState({ name: '', subject: '', body: '', category: '', status: 'draft' });
  const [error, setError] = useState(null);

  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates?search=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(Array.isArray(data) ? data : (data.templates || []));
      } else {
        setError('Failed to load templates.');
      }
    } catch (e) {
      console.error(e);
      setError('Network error loading templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [search]);

  const handleSave = async () => {
    setError(null);
    try {
      const url = currentTemplate.id ? `/api/templates/${currentTemplate.id}` : '/api/templates';
      const method = currentTemplate.id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentTemplate)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setIsEditing(false);
      fetchTemplates();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDuplicate = async (id) => {
    try {
      const res = await fetch(`/api/templates/${id}/duplicate`, { method: 'POST' });
      if (res.ok) fetchTemplates();
    } catch (e) {
      console.error(e);
    }
  };
  
  const handleArchive = async (id) => {
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' })
      });
      if (res.ok) fetchTemplates();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure? Note: You cannot delete templates used in campaigns. Archiving is safer.')) return;
    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) alert(data.error || 'Failed to delete');
      else fetchTemplates();
    } catch (e) {
      console.error(e);
    }
  };

  if (isEditing) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">{currentTemplate.id ? 'Edit Template' : 'Create Template'}</h2>
          <button onClick={() => setIsEditing(false)} className="px-4 py-2 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition-colors">Cancel</button>
        </div>
        {error && <div className="text-red-400 mb-4">{error}</div>}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1 text-slate-300">Name</label>
            <input className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:border-sky-500 outline-none" value={currentTemplate.name} onChange={e => setCurrentTemplate({...currentTemplate, name: e.target.value})} placeholder="e.g. Welcome Email" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 text-slate-300">Subject</label>
            <input className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:border-sky-500 outline-none" value={currentTemplate.subject} onChange={e => setCurrentTemplate({...currentTemplate, subject: e.target.value})} placeholder="Subject Line" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 text-slate-300">Category</label>
            <input className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:border-sky-500 outline-none" value={currentTemplate.category || ''} onChange={e => setCurrentTemplate({...currentTemplate, category: e.target.value})} placeholder="e.g. Onboarding" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 text-slate-300">Status</label>
            <select className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:border-sky-500 outline-none" value={currentTemplate.status} onChange={e => setCurrentTemplate({...currentTemplate, status: e.target.value})}>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 text-slate-300">Body HTML / Plain Text (Supports {'{{name}}'}, {'{{email}}'} variables)</label>
            <textarea rows={8} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-sm text-white font-mono focus:border-sky-500 custom-scrollbar outline-none" value={currentTemplate.body} onChange={e => setCurrentTemplate({...currentTemplate, body: e.target.value})} />
          </div>
          <div className="pt-2">
            <button onClick={handleSave} className="px-6 py-2.5 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl transition-colors">Save Template</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-300" />
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                <FileText className="w-6 h-6" />
              </div>
              Email Templates
            </h1>
            <p className="text-sm text-slate-400">Manage reusable email content for campaigns.</p>
          </div>
        </div>
        <button onClick={() => { setCurrentTemplate({ name: '', subject: '', body: '', category: '', status: 'draft' }); setIsEditing(true); }} className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-xl font-semibold shadow-lg shadow-sky-500/20 transition-colors">
          <Plus className="w-4 h-4" /> Create Template
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            <input type="text" placeholder="Search templates..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:border-sky-500 outline-none transition-colors" />
          </div>
        </div>
        
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 text-sm">{error}</div>
        ) : !templates || templates.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No templates found.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {Array.isArray(templates) && templates.map(t => (
              <div key={t.id} className="p-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-slate-200">{t.name}</span>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${t.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' : t.status === 'draft' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-500/20 text-slate-400'}`}>
                      {t.status.toUpperCase()}
                    </span>
                    {t.category && <span className="text-[10px] text-sky-400 border border-sky-400/30 px-1.5 rounded">{t.category}</span>}
                  </div>
                  <div className="text-sm text-slate-400">Subj: {t.subject}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleDuplicate(t.id)} className="p-2 text-slate-400 hover:text-white bg-slate-950 rounded-lg hover:bg-slate-700 transition-colors" title="Duplicate">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setCurrentTemplate(t); setIsEditing(true); }} className="p-2 text-slate-400 hover:text-white bg-slate-950 rounded-lg hover:bg-slate-700 transition-colors" title="Edit">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {t.status !== 'archived' && (
                    <button onClick={() => handleArchive(t.id)} className="p-2 text-slate-400 hover:text-white bg-slate-950 rounded-lg hover:bg-slate-700 transition-colors" title="Archive">
                      <Archive className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => handleDelete(t.id)} className="p-2 text-red-400 hover:text-red-300 bg-slate-950 rounded-lg hover:bg-slate-700 transition-colors" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
