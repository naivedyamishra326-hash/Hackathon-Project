import { useState, useEffect } from 'react';
import { api, type Incident } from '../api.ts';
import { Crosshair, AlertTriangle, Zap, RefreshCw } from 'lucide-react';

const severityStyle: Record<string, string> = {
  CRITICAL: 'bg-red-500/10 border-red-500/30 text-red-400',
  HIGH: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
  MEDIUM: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  LOW: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
};

export default function IncidentExplorer() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [circuitBreaker, setCircuitBreaker] = useState<any>(null);

  const loadData = async () => {
    try {
      const incRes = await api.getIncidents();
      setIncidents(incRes.incidents);
      const cbRes = await api.getCircuitBreaker();
      if (cbRes.statuses?.length > 0) {
        setCircuitBreaker(cbRes.statuses[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleResetBreaker = async () => {
    await api.resetCircuitBreaker();
    loadData();
  };

  return (
    <div className="p-6 h-full flex flex-col space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-orange-400" /> Attack Chain Explorer
          </h2>
          <p className="text-sm text-gray-500 mt-1">Correlated behavioral incidents and self-healing defense telemetry</p>
        </div>
      </div>

      {/* Autonomous Circuit Breaker Banner */}
      {circuitBreaker && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-xs transition ${
          circuitBreaker.state === 'QUARANTINED'
            ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
            : 'bg-gray-900/60 border-gray-800 text-gray-300'
        }`}>
          <div className="flex items-center gap-3">
            <Zap className={`w-5 h-5 ${circuitBreaker.state === 'QUARANTINED' ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`} />
            <div>
              <div className="font-bold flex items-center gap-2">
                Autonomous Circuit Breaker Status:
                <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                  circuitBreaker.state === 'QUARANTINED' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}>
                  {circuitBreaker.state}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5 font-mono">
                Agent: {circuitBreaker.agentIdentity} | Violations Recorded: {circuitBreaker.violationCount}/{circuitBreaker.threshold}
                {circuitBreaker.quarantinedAt && <> | Isolated At: {new Date(circuitBreaker.quarantinedAt).toLocaleTimeString()}</>}
              </p>
            </div>
          </div>
          {circuitBreaker.state === 'QUARANTINED' && (
            <button
              onClick={handleResetBreaker}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reset & Restore Token
            </button>
          )}
        </div>
      )}

      {incidents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
          <div className="text-center">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-gray-700" />
            <p>No incidents detected</p>
            <p className="text-xs text-gray-700 mt-1">Run attack simulations to generate correlated incidents</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex gap-4 min-h-0">
          <div className="flex-1 space-y-3 overflow-y-auto">
            {incidents.map(inc => (
              <div
                key={inc.id}
                onClick={() => setSelected(inc)}
                className={`bg-gray-900/60 border rounded-xl p-4 cursor-pointer hover:bg-gray-900/80 transition-smooth ${
                  selected?.id === inc.id ? 'ring-1 ring-sentinel-500' : 'border-gray-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${severityStyle[inc.severity] || ''}`}>
                    {inc.severity}
                  </span>
                  <span className="text-xs text-gray-500">{new Date(inc.detectedAt).toLocaleString()}</span>
                </div>
                <p className="text-sm text-white font-medium">{inc.description}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                  <span>Agent: {inc.agentIdentity.split('/').pop()}</span>
                  <span>Events: {inc.eventChain.length}</span>
                  <span className="capitalize">{inc.status}</span>
                </div>
              </div>
            ))}
          </div>

          {selected && (
            <div className="w-96 bg-gray-900/60 border border-gray-800 rounded-xl p-4 overflow-y-auto">
              <h3 className="text-sm font-semibold text-white mb-3">Event Chain</h3>
              <div className="space-y-3">
                {selected.eventChain.map((evt, i) => (
                  <div key={evt.eventId} className="relative pl-6">
                    {i < selected.eventChain.length - 1 && (
                      <div className="absolute left-2 top-6 bottom-0 w-px bg-gray-700" />
                    )}
                    <div className="absolute left-0 top-1 w-4 h-4 rounded-full border-2 border-gray-600 bg-gray-900 flex items-center justify-center">
                      <div className={`w-2 h-2 rounded-full ${
                        evt.decision === 'DENY' ? 'bg-red-500' :
                        evt.eventType.includes('INJECTION') ? 'bg-orange-500' :
                        evt.eventType.includes('SECRET') ? 'bg-yellow-500' : 'bg-green-500'
                      }`} />
                    </div>
                    <div className="text-xs">
                      <div className="text-gray-400">{new Date(evt.timestamp).toLocaleTimeString()}</div>
                      <div className="text-white font-medium">{evt.eventType.replace(/_/g, ' ')}</div>
                      <div className="text-gray-500">Tool: {evt.toolName}</div>
                      {evt.decision && <div className={evt.decision === 'DENY' ? 'text-red-400' : 'text-green-400'}>{evt.decision}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
