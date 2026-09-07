import React, { useState, useEffect } from 'react';
import { 
  Users, UserCheck, Clock, AlertTriangle, ShieldCheck, CheckCircle2, 
  BarChart3, RefreshCw, Filter, ArrowUpDown, LayoutGrid, List, Search,
  ChevronRight, Zap, ShieldAlert, Timer
} from 'lucide-react';
import TeamMemberDrawer from './TeamMemberDrawer';

export default function TeamPerformanceSection({ onSelectCampaign, onRefresh }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Sorting state
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('highest_tat'); // 'highest_tat', 'most_pending', 'most_breaches', 'highest_completed'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Selected team member drawer state
  const [selectedMember, setSelectedMember] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const fetchPerformanceStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stats/team-performance');
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed fetching team performance stats:', err);
      setError(err.message || 'Failed loading team performance stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPerformanceStats();
  }, []);

  if (loading) {
    return (
      <div className="glass-panel rounded-2xl p-8 border border-slate-800 bg-slate-900/60 flex flex-col items-center justify-center gap-3 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
        <span className="text-xs font-medium">Loading Team Performance Metrics...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass-panel rounded-2xl p-6 border border-slate-800 bg-slate-900/60 flex flex-col items-center justify-center gap-3 text-rose-400">
        <AlertTriangle className="w-8 h-8" />
        <span className="text-sm font-semibold">{error || 'Unable to load performance metrics'}</span>
        <button
          onClick={fetchPerformanceStats}
          className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const { team_stats = [], unassigned_stat } = data;

  // Extract list of unique teams
  const allTeams = Array.from(new Set(team_stats.map(m => m.team))).filter(Boolean);

  // Filter team members
  let filteredStats = team_stats.filter(m => {
    const matchesTeam = selectedTeam === 'all' || m.team === selectedTeam;
    const matchesSearch = !searchTerm || 
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      m.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.team.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesTeam && matchesSearch;
  });

  // Sort team members
  filteredStats.sort((a, b) => {
    if (sortBy === 'highest_tat') {
      return (b.avg_action_tat_seconds || 0) - (a.avg_action_tat_seconds || 0);
    }
    if (sortBy === 'most_pending') {
      return b.pending_count - a.pending_count;
    }
    if (sortBy === 'most_breaches') {
      return b.sla_breached_count - a.sla_breached_count;
    }
    if (sortBy === 'highest_completed') {
      return b.actioned_count - a.actioned_count;
    }
    return 0;
  });

  const handleOpenMemberDrawer = (member) => {
    setSelectedMember(member);
    setIsDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 shadow-md shadow-sky-500/20 text-white">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
              <span>Team Member Workload & TAT Console</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                {team_stats.length} Active Members
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Individual team ownership, pending queues, SLA risk breaches, and turnaround performance
            </p>
          </div>
        </div>

        {/* Refresh & Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={fetchPerformanceStats}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 text-xs transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
            <span>Refresh Stats</span>
          </button>
        </div>
      </div>

      {/* Toolbar: Search, Team Filter, Sort, View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
        
        {/* Search & Team Filter */}
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search member or team..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 focus:border-sky-500 text-xs text-white placeholder-slate-500 rounded-xl pl-9 pr-8 py-2 outline-none transition-colors"
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

          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 outline-none cursor-pointer"
          >
            <option value="all">All Teams ({allTeams.length})</option>
            {allTeams.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Sort By & View Mode */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
            <ArrowUpDown className="w-3.5 h-3.5 text-sky-400" />
            <span>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-xs text-white rounded-xl px-3 py-2 outline-none cursor-pointer"
            >
              <option value="highest_tat">Highest Avg TAT</option>
              <option value="most_pending">Most Pending Emails</option>
              <option value="most_breaches">Most SLA Breaches</option>
              <option value="highest_completed">Highest Completed Count</option>
            </select>
          </div>

          {/* Grid vs Table view toggle */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${viewMode === 'grid' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'}`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${viewMode === 'table' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'}`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>

      {/* Unassigned Queue Banner Card */}
      {unassigned_stat && unassigned_stat.total_assigned > 0 && (
        <div 
          onClick={() => handleOpenMemberDrawer(null)}
          className="glass-panel p-4 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-950 flex flex-wrap items-center justify-between gap-4 cursor-pointer hover:border-amber-500/50 transition-all group shadow-lg shadow-amber-500/5"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm">Unassigned Queue</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {unassigned_stat.total_assigned} Unassigned Items
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Emails pending auto-matching or manual team assignment
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs font-semibold">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Pending:</span>
              <span className="text-amber-400">{unassigned_stat.pending_count}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Breached:</span>
              <span className="text-rose-400">{unassigned_stat.sla_breached_count}</span>
            </div>
            <div className="flex items-center gap-1 text-sky-400 group-hover:translate-x-1 transition-transform">
              <span>View Unassigned Log</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      )}

      {/* Grid or Table Display */}
      {filteredStats.length === 0 ? (
        <div className="h-48 glass-panel rounded-2xl border border-slate-800 bg-slate-900/40 flex flex-col items-center justify-center text-slate-500 text-xs">
          No team members match the selected filters.
        </div>
      ) : viewMode === 'grid' ? (
        
        /* GRID VIEW CARDS */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredStats.map((member) => (
            <div
              key={member.id}
              onClick={() => handleOpenMemberDrawer(member)}
              className="glass-panel p-5 rounded-2xl border border-slate-800/80 bg-slate-950/60 hover:bg-slate-900/80 hover:border-slate-700 transition-all cursor-pointer group flex flex-col justify-between relative overflow-hidden"
            >
              <div>
                {/* Header: Avatar, Name, Capacity */}
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800/80 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 font-bold text-sm group-hover:scale-105 transition-transform">
                      {member.name[0].toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-sm group-hover:text-sky-300 transition-colors">
                        {member.name}
                      </h3>
                      <div className="text-[11px] text-slate-400 font-mono">{member.email}</div>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                    {member.team}
                  </span>
                </div>

                {/* No Assignments Warning */}
                {!member.has_assignments ? (
                  <div className="py-6 text-center text-xs text-slate-500 italic bg-slate-900/40 rounded-xl border border-slate-800/50 mb-3">
                    No assigned items yet
                  </div>
                ) : (
                  /* Metrics Grid */
                  <div className="grid grid-cols-2 gap-2.5 mb-4 text-xs">
                    
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Total Assigned</div>
                      <div className="text-lg font-extrabold text-white mt-1">{member.total_assigned}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {member.auto_assigned_count} auto / {member.manually_assigned_count} manual
                      </div>
                    </div>

                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Pending vs Done</div>
                      <div className="text-sm font-bold mt-1 flex items-center gap-2">
                        <span className="text-amber-400">{member.pending_count} pending</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-emerald-400">{member.actioned_count} done</span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden flex">
                        <div className="bg-emerald-500 h-full" style={{ width: `${member.completion_rate}%` }} />
                        <div className="bg-amber-500 h-full" style={{ width: `${100 - member.completion_rate}%` }} />
                      </div>
                    </div>

                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Avg Action TAT</div>
                      <div className="text-sm font-extrabold text-emerald-300 mt-1 font-mono">
                        {member.avg_action_tat_formatted}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Resolved turnaround</div>
                    </div>

                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Oldest Pending</div>
                      <div className="text-sm font-extrabold text-amber-300 mt-1 font-mono">
                        {member.oldest_pending_formatted}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Waiting duration</div>
                    </div>

                  </div>
                )}
              </div>

              {/* Card Footer: SLA Badges & Inspect Button */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs">
                <div className="flex items-center gap-1.5">
                  {member.sla_breached_count > 0 ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {member.sla_breached_count} Breached
                    </span>
                  ) : member.sla_at_risk_count > 0 ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {member.sla_at_risk_count} At Risk
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> SLA Compliant
                    </span>
                  )}
                </div>

                <div className="inline-flex items-center gap-1 text-sky-400 text-xs font-semibold group-hover:translate-x-1 transition-transform">
                  <span>Logs</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>

            </div>
          ))}
        </div>

      ) : (
        
        /* TABLE VIEW */
        <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Team Member</th>
                  <th className="py-3.5 px-4">Team</th>
                  <th className="py-3.5 px-4 text-center">Assigned</th>
                  <th className="py-3.5 px-4 text-center">Pending</th>
                  <th className="py-3.5 px-4 text-center">Actioned</th>
                  <th className="py-3.5 px-4 text-center">SLA Breaches</th>
                  <th className="py-3.5 px-4 font-mono">Avg Action TAT</th>
                  <th className="py-3.5 px-4 font-mono">Oldest Pending</th>
                  <th className="py-3.5 px-4 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">
                {filteredStats.map((member) => (
                  <tr
                    key={member.id}
                    onClick={() => handleOpenMemberDrawer(member)}
                    className="hover:bg-slate-800/60 transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white group-hover:text-sky-300 transition-colors">
                        {member.name}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">{member.email}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                        {member.team}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center font-extrabold text-white">
                      {member.total_assigned}
                    </td>

                    <td className="py-3.5 px-4 text-center font-bold text-amber-400">
                      {member.pending_count}
                    </td>

                    <td className="py-3.5 px-4 text-center font-bold text-emerald-400">
                      {member.actioned_count} ({member.completion_rate}%)
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {member.sla_breached_count > 0 ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          {member.sla_breached_count} Breached
                        </span>
                      ) : (
                        <span className="text-slate-500">0</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-mono font-semibold text-emerald-300">
                      {member.avg_action_tat_formatted}
                    </td>

                    <td className="py-3.5 px-4 font-mono font-semibold text-amber-300">
                      {member.oldest_pending_formatted}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <span className="inline-flex items-center gap-1 text-xs text-sky-400 font-medium group-hover:translate-x-1 transition-transform">
                        <span>View</span>
                        <ChevronRight className="w-4 h-4" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Team Member Assigned Email Log Drawer Modal */}
      <TeamMemberDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        teamMember={selectedMember}
        teamMembers={team_stats}
        onSelectCampaign={onSelectCampaign}
        onRefreshTeamStats={fetchPerformanceStats}
      />

    </div>
  );
}
