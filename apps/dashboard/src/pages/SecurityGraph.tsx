import { useState, useEffect } from 'react';
import { Shield, Server, Database, Bot, Lock, AlertTriangle, CheckCircle2, XCircle, Zap, RefreshCw, Eye } from 'lucide-react';
import { api, useSSE } from '../api';

interface GraphNode {
  id: string;
  label: string;
  sublabel: string;
  type: 'agent' | 'proxy' | 'engine' | 'tool' | 'resource';
  status: 'safe' | 'warning' | 'alert' | 'active';
  x: number;
  y: number;
  details: Record<string, string>;
}

export default function SecurityGraph() {
  const [activeMode, setActiveMode] = useState<'normal' | 'attack' | 'quarantine' | 'approval'>('normal');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [circuitStatus, setCircuitStatus] = useState<any>(null);
  const [livePulse, setLivePulse] = useState<boolean>(true);

  useEffect(() => {
    loadCircuitStatus();
  }, []);

  const loadCircuitStatus = async () => {
    try {
      const res = await api.getCircuitBreaker();
      if (res.statuses?.length > 0) {
        setCircuitStatus(res.statuses[0]);
        if (res.statuses[0].state === 'QUARANTINED') {
          setActiveMode('quarantine');
        }
      }
    } catch { /* ignore */ }
  };

  const { connect, disconnect } = useSSE((event) => {
    if (event.type === 'circuit_breaker') {
      loadCircuitStatus();
    }
  });

  useEffect(() => {
    connect();
    return () => disconnect();
  }, []);

  const nodes: GraphNode[] = [
    {
      id: 'agent',
      label: 'Financial Remediation Agent',
      sublabel: 'spiffe://demo.local/agent/financial-remediation',
      type: 'agent',
      status: activeMode === 'quarantine' ? 'alert' : 'active',
      x: 100,
      y: 260,
      details: {
        'Identity Subject': 'spiffe://demo.local/agent/financial-remediation',
        'Algorithm': 'EdDSA (Ed25519) Signed JWT',
        'Authorized Scope': 'ledger.read, ledger.refund (Max $50)',
        'Status': activeMode === 'quarantine' ? 'QUARANTINED BY CIRCUIT BREAKER' : 'ACTIVE & VERIFIED',
      },
    },
    {
      id: 'sidecar',
      label: 'MCP Sentinel Proxy',
      sublabel: 'Zero-Trust stdio Interceptor',
      type: 'proxy',
      status: activeMode === 'attack' ? 'warning' : 'safe',
      x: 360,
      y: 260,
      details: {
        'Inspection Mode': 'Deterministic Multi-Stage Pre-flight',
        'Checks Enforced': 'Path Traversal, SSRF, Shell Injection, Payload Depth',
        'Fail-Closed Posture': 'Enabled (All unexpected tools blocked)',
        'Response Scanning': 'Regex Secret Redaction + Prompt Injection Taint',
      },
    },
    {
      id: 'cedar',
      label: 'Cedar Policy Engine',
      sublabel: 'Rust/WASM ABAC Evaluator',
      type: 'engine',
      status: activeMode === 'attack' ? 'warning' : 'safe',
      x: 580,
      y: 140,
      details: {
        'Engine Type': '@cedar-policy/cedar-wasm v4.13.0',
        'Policy Set': 'base.cedar + fintech.cedar (Default-Deny)',
        'Avg Evaluation Latency': '0.642 ms (Sub-millisecond)',
        'Enforcement': 'Monotonic Attribute Constraints',
      },
    },
    {
      id: 'audit',
      label: 'Audit & Hash Chain',
      sublabel: 'SHA-256 Tamper-Evident Merkle Chain',
      type: 'engine',
      status: 'safe',
      x: 580,
      y: 380,
      details: {
        'Storage Engine': 'SQLite WASM (In-memory/disk backed)',
        'Integrity Algorithm': 'SHA-256 Previous-Hash Cryptographic Chaining',
        'Validation State': '100% Chain Valid (Zero tampering detected)',
      },
    },
    {
      id: 'tool_refund',
      label: 'issue_refund',
      sublabel: 'MCP Tool: Financial Ledger Mutation',
      type: 'tool',
      status: activeMode === 'attack' ? 'alert' : activeMode === 'approval' ? 'warning' : 'safe',
      x: 820,
      y: 160,
      details: {
        'Tool Name': 'issue_refund',
        'Target': 'apps/demo-mcp-server',
        'Policy Limit': '$50.00 Autonomous Max',
        'Supervisor Tier': '$50 - $200 (Requires HITL Step-Up)',
      },
    },
    {
      id: 'tool_account',
      label: 'get_account / get_txn',
      sublabel: 'MCP Tool: Ledger Reader',
      type: 'tool',
      status: 'safe',
      x: 820,
      y: 360,
      details: {
        'Tool Name': 'get_account',
        'Category': 'fintech-read',
        'Policy Status': 'Permitted for active accounts',
      },
    },
    {
      id: 'res_acc1001',
      label: 'Account ACC-1001',
      sublabel: 'Active Customer (Alice Johnson)',
      type: 'resource',
      status: 'safe',
      x: 1060,
      y: 160,
      details: {
        'Account ID': 'ACC-1001',
        'Customer': 'Alice Johnson',
        'Status': 'active',
        'Cedar Scope': 'Explicitly authorized for remediation agent',
      },
    },
    {
      id: 'res_acc1002',
      label: 'Account ACC-1002',
      sublabel: 'Customer (Bob Smith) — Boundary',
      type: 'resource',
      status: activeMode === 'attack' ? 'alert' : 'safe',
      x: 1060,
      y: 360,
      details: {
        'Account ID': 'ACC-1002',
        'Customer': 'Bob Smith',
        'Boundary Status': 'OUT OF AGENT SCOPE (Blocked by Cedar)',
      },
    },
  ];

  const getStatusColor = (status: GraphNode['status']) => {
    switch (status) {
      case 'active': return 'text-sentinel-400 border-sentinel-500/50 bg-sentinel-950/40';
      case 'safe': return 'text-emerald-400 border-emerald-500/40 bg-emerald-950/30';
      case 'warning': return 'text-amber-400 border-amber-500/50 bg-amber-950/40';
      case 'alert': return 'text-rose-400 border-rose-500/60 bg-rose-950/50 shadow-rose-900/50 shadow-lg';
    }
  };

  const getNodeIcon = (type: GraphNode['type']) => {
    switch (type) {
      case 'agent': return Bot;
      case 'proxy': return Shield;
      case 'engine': return Lock;
      case 'tool': return Server;
      case 'resource': return Database;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-sentinel-400" />
            Zero-Trust Topology & Blast Radius Graph
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Real-time interactive dataflow, Cedar policy boundary mediation, and blast-radius perimeter.
          </p>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 p-1 rounded-lg text-xs">
          <button
            onClick={() => setActiveMode('normal')}
            className={`px-3 py-1.5 rounded-md font-medium transition ${activeMode === 'normal' ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40' : 'text-gray-400 hover:text-white'}`}
          >
            Normal Flow
          </button>
          <button
            onClick={() => setActiveMode('approval')}
            className={`px-3 py-1.5 rounded-md font-medium transition ${activeMode === 'approval' ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40' : 'text-gray-400 hover:text-white'}`}
          >
            Step-Up Approval ($120)
          </button>
          <button
            onClick={() => setActiveMode('attack')}
            className={`px-3 py-1.5 rounded-md font-medium transition ${activeMode === 'attack' ? 'bg-rose-600/30 text-rose-300 border border-rose-500/40' : 'text-gray-400 hover:text-white'}`}
          >
            Blocked Attack Flow
          </button>
          <button
            onClick={() => setActiveMode('quarantine')}
            className={`px-3 py-1.5 rounded-md font-medium transition ${activeMode === 'quarantine' ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40' : 'text-gray-400 hover:text-white'}`}
          >
            Circuit Quarantined
          </button>
        </div>
      </div>

      {/* Main Canvas + Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* SVG Network Topology (3 cols) */}
        <div className="lg:col-span-3 bg-gray-900/60 border border-gray-800 rounded-xl p-4 relative overflow-hidden min-h-[540px]">
          {/* Legend */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-4 text-[11px] bg-gray-950/80 px-3 py-1.5 rounded-lg border border-gray-800 text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Permitted Flow</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /> HITL Step-Up</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" /> Blocked / Blast Perimeter</span>
          </div>

          <svg className="w-full h-[500px]" viewBox="0 0 1200 520">
            <defs>
              <linearGradient id="grad-allowed" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.8" />
              </linearGradient>
              <linearGradient id="grad-blocked" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#e11d48" stopOpacity="0.2" />
              </linearGradient>
              <linearGradient id="grad-hitl" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#d97706" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            {/* Connection: Agent -> Sidecar */}
            <line
              x1="220" y1="260" x2="360" y2="260"
              stroke={activeMode === 'quarantine' ? '#a855f7' : '#38bdf8'}
              strokeWidth="2.5"
              strokeDasharray={activeMode === 'quarantine' ? '4,4' : 'none'}
            />

            {/* Connection: Sidecar -> Cedar */}
            <path
              d="M 460 260 C 510 260, 510 140, 580 140"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2"
            />

            {/* Connection: Sidecar -> Audit */}
            <path
              d="M 460 260 C 510 260, 510 380, 580 380"
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
            />

            {/* Connection: Cedar -> Tool Refund */}
            <path
              d="M 680 140 C 740 140, 740 160, 820 160"
              fill="none"
              stroke={activeMode === 'attack' ? '#f43f5e' : activeMode === 'approval' ? '#f59e0b' : '#10b981'}
              strokeWidth={activeMode === 'attack' ? '3' : '2'}
              strokeDasharray={activeMode === 'attack' ? '6,3' : 'none'}
            />

            {/* Connection: Cedar -> Tool Account */}
            <path
              d="M 680 140 C 740 140, 740 360, 820 360"
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
            />

            {/* Connection: Tool Refund -> ACC-1001 */}
            <line
              x1="930" y1="160" x2="1060" y2="160"
              stroke={activeMode === 'approval' ? '#f59e0b' : '#10b981'}
              strokeWidth="2"
            />

            {/* Connection: Tool Refund -> ACC-1002 (Blocked attempt) */}
            <line
              x1="930" y1="160" x2="1060" y2="360"
              stroke="#f43f5e"
              strokeWidth={activeMode === 'attack' ? '3' : '1'}
              strokeDasharray="4,4"
              opacity={activeMode === 'attack' ? '1' : '0.2'}
            />

            {/* Connection: Tool Account -> ACC-1001 */}
            <line
              x1="930" y1="360" x2="1060" y2="160"
              stroke="#10b981"
              strokeWidth="1.5"
              opacity="0.4"
            />

            {/* Connection: Tool Account -> ACC-1002 */}
            <line
              x1="930" y1="360" x2="1060" y2="360"
              stroke="#10b981"
              strokeWidth="2"
            />

            {/* Blast-Radius Aura (When in Attack Mode) */}
            {activeMode === 'attack' && (
              <g>
                <circle cx="875" cy="160" r="70" fill="url(#grad-blocked)" className="animate-pulse" />
                <circle cx="875" cy="160" r="110" fill="none" stroke="#f43f5e" strokeWidth="1" strokeDasharray="3,3" opacity="0.6" />
                <circle cx="875" cy="160" r="140" fill="none" stroke="#f43f5e" strokeWidth="0.5" opacity="0.3" />
                <text x="825" y="80" fill="#f43f5e" fontSize="11" fontWeight="bold">BLAST PERIMETER CONTAINED</text>
              </g>
            )}

            {/* Step-Up HITL Ring (When in Approval Mode) */}
            {activeMode === 'approval' && (
              <g>
                <circle cx="875" cy="160" r="60" fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4,4" className="animate-spin" />
                <text x="820" y="85" fill="#f59e0b" fontSize="11" fontWeight="bold">APPROVAL REQUIRED ($120)</text>
              </g>
            )}

            {/* Quarantine Aura (When in Quarantine Mode) */}
            {activeMode === 'quarantine' && (
              <g>
                <circle cx="160" cy="260" r="65" fill="#a855f7" fillOpacity="0.15" />
                <circle cx="160" cy="260" r="85" fill="none" stroke="#a855f7" strokeWidth="2" strokeDasharray="5,3" />
                <text x="95" y="180" fill="#c084fc" fontSize="11" fontWeight="bold">AGENT QUARANTINED</text>
              </g>
            )}

            {/* Render Nodes */}
            {nodes.map((node) => {
              const Icon = getNodeIcon(node.type);
              const isSelected = selectedNode?.id === node.id;

              return (
                <g
                  key={node.id}
                  onClick={() => setSelectedNode(node)}
                  className="cursor-pointer"
                  transform={`translate(${node.x - 60}, ${node.y - 40})`}
                >
                  <rect
                    width="130"
                    height="80"
                    rx="10"
                    className={`transition-all duration-300 ${isSelected ? 'stroke-white stroke-2' : ''}`}
                    fill="#0f172a"
                    stroke={
                      node.status === 'alert' ? '#f43f5e' :
                      node.status === 'warning' ? '#f59e0b' :
                      node.status === 'active' ? '#38bdf8' : '#10b981'
                    }
                    strokeWidth="1.5"
                  />
                  <foreignObject width="130" height="80">
                    <div className="p-2.5 h-full flex flex-col justify-between text-left select-none">
                      <div className="flex items-center justify-between">
                        <Icon className={`w-4 h-4 ${
                          node.status === 'alert' ? 'text-rose-400' :
                          node.status === 'warning' ? 'text-amber-400' :
                          node.status === 'active' ? 'text-sentinel-400' : 'text-emerald-400'
                        }`} />
                        <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-mono font-semibold ${
                          node.status === 'alert' ? 'bg-rose-500/20 text-rose-300' :
                          node.status === 'warning' ? 'bg-amber-500/20 text-amber-300' :
                          node.status === 'active' ? 'bg-sentinel-500/20 text-sentinel-300' : 'bg-emerald-500/20 text-emerald-300'
                        }`}>
                          {node.type}
                        </span>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-white truncate">{node.label}</p>
                        <p className="text-[9px] text-gray-400 truncate">{node.sublabel}</p>
                      </div>
                    </div>
                  </foreignObject>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Node Inspector Drawer (1 col) */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Eye className="w-4 h-4 text-sentinel-400" />
              Node Inspector
            </h3>
            {selectedNode && (
              <span className="text-[10px] text-gray-400 font-mono">ID: {selectedNode.id}</span>
            )}
          </div>

          {selectedNode ? (
            <div className="space-y-4">
              <div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-gray-400">Entity Name</span>
                <p className="text-sm font-semibold text-white mt-0.5">{selectedNode.label}</p>
                <p className="text-xs text-gray-400 font-mono break-all">{selectedNode.sublabel}</p>
              </div>

              <div className="space-y-2.5">
                <span className="text-[10px] uppercase font-mono tracking-wider text-gray-400">Security Attributes</span>
                {Object.entries(selectedNode.details).map(([key, val]) => (
                  <div key={key} className="bg-gray-950/70 border border-gray-800/80 rounded-lg p-2.5">
                    <p className="text-[10px] text-gray-400 font-medium">{key}</p>
                    <p className="text-xs text-gray-200 font-mono mt-0.5 break-all">{val}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-16 text-center text-gray-500 space-y-2">
              <Shield className="w-8 h-8 mx-auto text-gray-600" />
              <p className="text-xs">Click any node in the topology map to inspect permissions, Cedar policies, and cryptographic identity.</p>
            </div>
          )}

          {/* Autonomous Circuit Breaker Status Widget */}
          <div className="border-t border-gray-800 pt-4 mt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Circuit Breaker
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                activeMode === 'quarantine' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              }`}>
                {activeMode === 'quarantine' ? 'TRIPPED (QUARANTINED)' : 'ARMED (NORMAL)'}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Automatic isolation trips after 3 consecutive policy or injection violations.
            </p>
            {activeMode === 'quarantine' && (
              <button
                onClick={async () => {
                  await api.resetCircuitBreaker();
                  setActiveMode('normal');
                  loadCircuitStatus();
                }}
                className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-1.5 bg-sentinel-600/30 hover:bg-sentinel-600/50 border border-sentinel-500/50 text-sentinel-300 rounded-lg text-xs font-medium transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reset Circuit Breaker
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
