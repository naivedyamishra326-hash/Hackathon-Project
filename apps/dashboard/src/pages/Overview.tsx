import { useState, useEffect } from 'react';
import { api, type SecurityMetrics } from '../api.ts';
import { ShieldCheck, ShieldX, Clock, Users, AlertTriangle, Gauge } from 'lucide-react';

export default function Overview() {
  const [metrics, setMetrics] = useState<SecurityMetrics | null>(null);
  const [integrity, setIntegrity] = useState<{ valid: boolean; checkedCount: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [m, i] = await Promise.all([api.getMetrics(), api.verifyIntegrity()]);
        setMetrics(m);
        setIntegrity(i);
      } catch (err) { console.error(err); }
      setLoading(false);
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="p-8 text-gray-500">Loading metrics...</div>;
  if (!metrics) return <div className="p-8 text-red-400">Failed to load metrics. Is the API server running on port 3100?</div>;

  const cards = [
    { label: 'Total Invocations', value: metrics.totalInvocations, icon: Gauge, color: 'text-sentinel-400' },
    { label: 'Allowed', value: metrics.allowedRequests, icon: ShieldCheck, color: 'text-green-400' },
    { label: 'Blocked', value: metrics.blockedRequests, icon: ShieldX, color: 'text-red-400' },
    { label: 'Active Incidents', value: metrics.activeIncidents, icon: AlertTriangle, color: 'text-orange-400' },
    { label: 'Distinct Agents', value: metrics.distinctAgents, icon: Users, color: 'text-purple-400' },
    { label: 'Avg Latency', value: `${metrics.avgAuthzLatencyMs.toFixed(1)}ms`, icon: Clock, color: 'text-cyan-400' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Security Overview</h2>
        <p className="text-sm text-gray-500 mt-1">Real-time metrics from the MCP Sentinel enforcement layer</p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs text-gray-500 font-medium">{label}</span>
            </div>
            <div className="text-2xl font-bold text-white">{value}</div>
          </div>
        ))}
      </div>

      {/* Latency + Integrity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Authorization Latency</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-gray-500">p50</div>
              <div className="text-lg font-mono text-green-400">{metrics.p50LatencyMs.toFixed(2)}ms</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">p95</div>
              <div className="text-lg font-mono text-yellow-400">{metrics.p95LatencyMs.toFixed(2)}ms</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">p99</div>
              <div className="text-lg font-mono text-orange-400">{metrics.p99LatencyMs.toFixed(2)}ms</div>
            </div>
          </div>
        </div>

        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Audit Chain Integrity</h3>
          {integrity ? (
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${integrity.valid ? 'bg-green-500' : 'bg-red-500'}`} />
              <div>
                <div className="text-sm text-white font-medium">{integrity.valid ? 'Chain Valid' : 'Chain Broken'}</div>
                <div className="text-xs text-gray-500">{integrity.checkedCount} events verified</div>
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-sm">Checking...</div>
          )}
        </div>
      </div>

      {/* Block Rate */}
      {metrics.totalInvocations > 0 && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Security Enforcement</h3>
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-600 to-green-500 rounded-full transition-all duration-500"
                style={{ width: `${(metrics.allowedRequests / metrics.totalInvocations) * 100}%` }}
              />
            </div>
            <span className="text-sm text-gray-400 font-mono w-16 text-right">
              {((metrics.blockedRequests / metrics.totalInvocations) * 100).toFixed(1)}% blocked
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
