import { useState } from 'react';
import { api } from '../api.ts';
import { FlaskConical, Play, RotateCcw, ShieldCheck, ShieldX, AlertTriangle, Bug, KeyRound, Ban, UserCheck, Zap, Check, X } from 'lucide-react';

const scenarios = [
  { id: 'legitimate-refund', label: 'Legitimate Refund', icon: ShieldCheck, desc: 'Agent refunds $29.50 to ACC-1001 — within authorized limits', color: 'text-green-400 border-green-500/20 bg-green-500/5' },
  { id: 'step-up-approval', label: 'HITL Step-Up Approval', icon: UserCheck, desc: 'Agent requests $120 refund (> $50 limit) — pauses for human supervisor decision', color: 'text-amber-400 border-amber-500/20 bg-amber-500/5' },
  { id: 'excessive-refund', label: 'Excessive Refund', icon: ShieldX, desc: 'Agent attempts $500 refund — exceeds $50 authorized limit', color: 'text-red-400 border-red-500/20 bg-red-500/5' },
  { id: 'circuit-breaker-quarantine', label: 'Autonomous Circuit Breaker', icon: Zap, desc: '3 rapid violations → trips breaker, isolates agent & revokes all tokens', color: 'text-rose-400 border-rose-500/20 bg-rose-500/5' },
  { id: 'cross-account', label: 'Cross-Account Access', icon: Ban, desc: 'Agent targets ACC-1002 — only authorized for ACC-1001', color: 'text-orange-400 border-orange-500/20 bg-orange-500/5' },
  { id: 'unauthorized-tool', label: 'Unauthorized Tool', icon: AlertTriangle, desc: 'Read-only analyst attempts issue_refund — lacks capability', color: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/5' },
  { id: 'prompt-injection', label: 'Prompt Injection', icon: Bug, desc: 'Malicious memo → injection detected → unauthorized action blocked', color: 'text-purple-400 border-purple-500/20 bg-purple-500/5' },
  { id: 'token-revocation', label: 'Token Revocation', icon: KeyRound, desc: 'Token issued → call succeeds → token revoked → call denied', color: 'text-cyan-400 border-cyan-500/20 bg-cyan-500/5' },
];

export default function AttackLab() {
  const [results, setResults] = useState<Record<string, any>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);

  const runScenario = async (id: string) => {
    setRunning(id);
    try {
      const result = await api.simulate(id);
      setResults(prev => ({ ...prev, [id]: result }));
    } catch (err) {
      setResults(prev => ({ ...prev, [id]: { error: String(err) } }));
    }
    setRunning(null);
  };

  const handleDecision = async (approvalId: string, decision: 'approve' | 'reject') => {
    setDeciding(approvalId);
    try {
      const res = await api.decideApproval(approvalId, decision);
      setResults(prev => ({
        ...prev,
        'step-up-approval': {
          ...prev['step-up-approval'],
          approval: res.approval,
          description: `Supervisor decided: ${decision.toUpperCase()}! Action ${decision === 'approve' ? 'ALLOWED and recorded' : 'DENIED'}.`,
        },
      }));
    } catch (err) {
      console.error(err);
    }
    setDeciding(null);
  };

  const handleReset = async () => {
    await api.reset();
    setResults({});
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-sentinel-400" /> Attack Simulation & Step-Up Lab
          </h2>
          <p className="text-sm text-gray-500 mt-1">Reproducible security scenarios — each generates real audit events and evaluations</p>
        </div>
        <button onClick={handleReset} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg">
          <RotateCcw className="w-3 h-3" /> Reset Environment
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {scenarios.map(({ id, label, icon: Icon, desc, color }) => (
          <div key={id} className={`bg-gray-900/60 border rounded-xl p-4 ${color.split(' ').slice(1).join(' ')}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${color.split(' ')[0]}`} />
                <h3 className="text-sm font-semibold text-white">{label}</h3>
              </div>
              <button
                onClick={() => runScenario(id)}
                disabled={running === id}
                className="flex items-center gap-1 px-2.5 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-50 font-medium"
              >
                <Play className="w-3 h-3" />
                {running === id ? 'Running...' : 'Run Scenario'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-3">{desc}</p>

            {results[id] && (
              <div className="mt-2 p-3 bg-gray-950/70 rounded-lg border border-gray-800 text-xs space-y-2">
                {results[id].error ? (
                  <span className="text-red-400">{results[id].error}</span>
                ) : (
                  <div>
                    <div className="text-gray-200 font-medium mb-1.5">{results[id].description}</div>
                    
                    {/* Inline HITL Step-Up Decision Controls */}
                    {results[id].approval && results[id].approval.status === 'pending' && (
                      <div className="mt-2.5 p-2 bg-amber-950/40 border border-amber-500/30 rounded-lg flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-amber-300">Pending Supervisor Decision</p>
                          <p className="text-[11px] text-gray-400">Request ID: {results[id].approval.id} ({results[id].approval.reason})</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDecision(results[id].approval.id, 'approve')}
                            disabled={deciding === results[id].approval.id}
                            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold transition"
                          >
                            <Check className="w-3 h-3" /> Approve
                          </button>
                          <button
                            onClick={() => handleDecision(results[id].approval.id, 'reject')}
                            disabled={deciding === results[id].approval.id}
                            className="flex items-center gap-1 px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-semibold transition"
                          >
                            <X className="w-3 h-3" /> Reject
                          </button>
                        </div>
                      </div>
                    )}

                    {results[id].approval && results[id].approval.status !== 'pending' && (
                      <div className="mt-2 text-xs font-mono">
                        Approval Status: <span className={results[id].approval.status === 'approved' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>{results[id].approval.status.toUpperCase()}</span> by {results[id].approval.resolvedBy}
                      </div>
                    )}

                    {results[id].event && (
                      <div className="font-mono text-gray-400 mt-1">
                        Decision: <span className={results[id].event.decision === 'ALLOW' ? 'text-green-400' : results[id].event.decision === 'APPROVAL_REQUIRED' ? 'text-amber-400' : 'text-red-400'}>{results[id].event.decision}</span>
                        {results[id].event.policyId && <> | Policy: {results[id].event.policyId}</>}
                      </div>
                    )}
                    {results[id].events && (
                      <div className="font-mono text-gray-400 mt-1">
                        Chain: {results[id].events.length} security events recorded in hash-chain
                      </div>
                    )}
                    {results[id].status && (
                      <div className="font-mono text-xs mt-1">
                        Circuit Breaker: <span className="text-rose-400 font-bold">{results[id].status.state}</span> ({results[id].status.violationCount} violations)
                      </div>
                    )}
                    {results[id].incident && (
                      <div className="mt-1 text-orange-400">
                        ⚠ Incident detected: {results[id].incident.description}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
