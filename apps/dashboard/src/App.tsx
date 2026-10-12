import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Shield, Activity, FileText, Users, Crosshair, Search, FlaskConical, BarChart3, Network, UserCheck, Check, X, Zap, AlertTriangle } from 'lucide-react';
import Overview from './pages/Overview.tsx';
import LiveMonitor from './pages/LiveMonitor.tsx';
import PolicyStudio from './pages/PolicyStudio.tsx';
import IdentityView from './pages/IdentityView.tsx';
import AttackLab from './pages/AttackLab.tsx';
import AuditExplorer from './pages/AuditExplorer.tsx';
import IncidentExplorer from './pages/IncidentExplorer.tsx';
import SecurityGraph from './pages/SecurityGraph.tsx';
import { api, useSSE } from './api.ts';

const navItems = [
  { to: '/', icon: BarChart3, label: 'Overview' },
  { to: '/graph', icon: Network, label: 'Security Graph' },
  { to: '/monitor', icon: Activity, label: 'Live Monitor' },
  { to: '/incidents', icon: Crosshair, label: 'Incidents' },
  { to: '/policies', icon: FileText, label: 'Policies' },
  { to: '/identity', icon: Users, label: 'Identity' },
  { to: '/attack-lab', icon: FlaskConical, label: 'Attack Lab' },
  { to: '/audit', icon: Search, label: 'Audit' },
];

export default function App() {
  const [pendingApproval, setPendingApproval] = useState<any>(null);
  const [quarantinedAgent, setQuarantinedAgent] = useState<string | null>(null);

  const checkPendingApprovals = async () => {
    try {
      const res = await api.getApprovals();
      const activePending = res.approvals?.find((a: any) => a.status === 'pending');
      setPendingApproval(activePending || null);
    } catch { /* ignore */ }
  };

  const checkCircuitBreaker = async () => {
    try {
      const res = await api.getCircuitBreaker();
      const q = res.statuses?.find((s: any) => s.state === 'QUARANTINED');
      setQuarantinedAgent(q ? q.agentIdentity : null);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    checkPendingApprovals();
    checkCircuitBreaker();
  }, []);

  const { connect, disconnect } = useSSE((event) => {
    if (event.type === 'approval_requested') {
      setPendingApproval(event.data);
    } else if (event.type === 'approval_resolved') {
      setPendingApproval((prev: any) => prev?.id === event.data?.id ? null : prev);
    } else if (event.type === 'circuit_breaker') {
      checkCircuitBreaker();
    }
  });

  useEffect(() => {
    connect();
    return () => disconnect();
  }, []);

  const handleDecision = async (decision: 'approve' | 'reject') => {
    if (!pendingApproval) return;
    try {
      await api.decideApproval(pendingApproval.id, decision, 'security-admin@demo.local');
      setPendingApproval(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetBreaker = async () => {
    try {
      await api.resetCircuitBreaker();
      setQuarantinedAgent(null);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-gray-950">
        {/* Sidebar */}
        <nav className="w-60 bg-gray-900/80 border-r border-gray-800 flex flex-col">
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <Shield className="w-7 h-7 text-sentinel-500" />
              <div>
                <h1 className="text-sm font-bold text-white tracking-wide">MCP SENTINEL</h1>
                <p className="text-[10px] text-gray-500 font-mono">ZERO-TRUST AGENTIC SIDECAR</p>
              </div>
            </div>
          </div>
          <div className="flex-1 py-2 overflow-y-auto">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm font-medium transition-smooth ${
                    isActive
                      ? 'bg-sentinel-600/20 text-sentinel-400 border border-sentinel-600/30'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
          </div>

          {/* Quarantined Alert in Sidebar */}
          {quarantinedAgent && (
            <div className="mx-2 mb-2 p-2.5 bg-rose-950/60 border border-rose-500/40 rounded-lg text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-rose-300 font-bold">
                <AlertTriangle className="w-3.5 h-3.5" />
                Agent Quarantined
              </div>
              <p className="text-[10px] text-gray-400 truncate font-mono">{quarantinedAgent.split('/').pop()}</p>
              <button
                onClick={handleResetBreaker}
                className="w-full text-center py-1 bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 rounded text-[10px] font-semibold transition"
              >
                Reset Breaker
              </button>
            </div>
          )}

          <div className="p-3 border-t border-gray-800">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse-dot" />
              <span>System Active</span>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto flex flex-col">
          {/* Global HITL Step-Up Floating Banner */}
          {pendingApproval && (
            <div className="bg-gradient-to-r from-amber-950/90 via-amber-900/80 to-amber-950/90 border-b border-amber-500/40 p-3 px-6 flex items-center justify-between text-xs animate-in slide-in-from-top">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-amber-500/20 text-amber-300 rounded-lg border border-amber-500/40">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-amber-200 mr-2">HUMAN-IN-THE-LOOP APPROVAL REQUIRED:</span>
                  <span className="text-gray-300">
                    Agent <strong>{pendingApproval.agentIdentity?.split('/').pop()}</strong> requested <strong>${pendingApproval.requestedAmount}</strong> refund for <strong>{pendingApproval.resourceId}</strong> ({pendingApproval.reason})
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDecision('approve')}
                  className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold shadow transition"
                >
                  <Check className="w-3.5 h-3.5" /> Approve
                </button>
                <button
                  onClick={() => handleDecision('reject')}
                  className="flex items-center gap-1 px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-semibold shadow transition"
                >
                  <X className="w-3.5 h-3.5" /> Reject
                </button>
              </div>
            </div>
          )}

          <div className="flex-1">
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/graph" element={<SecurityGraph />} />
              <Route path="/monitor" element={<LiveMonitor />} />
              <Route path="/incidents" element={<IncidentExplorer />} />
              <Route path="/policies" element={<PolicyStudio />} />
              <Route path="/identity" element={<IdentityView />} />
              <Route path="/attack-lab" element={<AttackLab />} />
              <Route path="/audit" element={<AuditExplorer />} />
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}
