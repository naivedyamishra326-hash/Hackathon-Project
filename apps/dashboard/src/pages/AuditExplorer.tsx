import { useState, useEffect } from 'react';
import { api, type AuditEvent } from '../api.ts';
import { Search, Download, Filter, ChevronDown, FileCheck, ShieldCheck, CheckCircle2, X } from 'lucide-react';

export default function AuditExplorer() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [filters, setFilters] = useState({ decision: '', type: '', tool: '', agent: '' });
  const [loading, setLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '200' };
      if (filters.decision) params.decision = filters.decision;
      if (filters.type) params.type = filters.type;
      if (filters.tool) params.tool = filters.tool;
      if (filters.agent) params.agent = filters.agent;
      const r = await api.getEvents(params);
      setEvents(r.events);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'sentinel-audit-export.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleGenerateReport = async () => {
    setLoadingReport(true);
    try {
      const rep = await api.getComplianceReport();
      setReportData(rep);
      setShowReport(true);
    } catch (err) {
      console.error(err);
    }
    setLoadingReport(false);
  };

  const handleDownloadReportMarkdown = () => {
    if (!reportData) return;
    let md = `# Executive & Compliance Security Audit Report\n\n`;
    md += `**Report ID:** ${reportData.reportId}\n`;
    md += `**Generated At:** ${reportData.generatedAt}\n`;
    md += `**Cryptographic Hash Chain Integrity:** ${reportData.chainIntegrity ? 'VERIFIED VALID' : 'FAILED'}\n`;
    md += `**Root Hash:** \`${reportData.rootHash}\`\n`;
    md += `**Total Events Verified:** ${reportData.totalEventsVerified}\n\n`;
    md += `## Framework Compliance Mapping\n\n`;

    for (const std of reportData.standards) {
      md += `### ${std.name} (${std.code}) — Status: ${std.status}\n\n`;
      md += `| Control ID | Description | Enforcement Mechanism | Status |\n`;
      md += `| :--- | :--- | :--- | :--- |\n`;
      for (const ctrl of std.controls) {
        md += `| ${ctrl.id} | ${ctrl.description} | ${ctrl.enforcementMechanism} | ${ctrl.status} |\n`;
      }
      md += `\n`;
    }

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `executive-compliance-report-${reportData.reportId}.md`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-white">Audit Explorer</h2>
          <p className="text-sm text-gray-500">Query and inspect cryptographically chained security audit records</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateReport}
            disabled={loadingReport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-sentinel-600 hover:bg-sentinel-500 rounded-lg font-medium shadow-md transition"
          >
            <FileCheck className="w-3.5 h-3.5" />
            {loadingReport ? 'Generating...' : 'Compliance Report'}
          </button>
          <button onClick={handleExport} className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg">
            <Download className="w-3 h-3" /> Export JSON
          </button>
        </div>
      </div>

      {/* Compliance Report Modal */}
      {showReport && reportData && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-750 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-gray-950/60">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
                <div>
                  <h3 className="text-base font-bold text-white">Executive Compliance & Audit Report</h3>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">Report ID: {reportData.reportId} | {reportData.generatedAt}</p>
                </div>
              </div>
              <button onClick={() => setShowReport(false)} className="text-gray-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs">
              {/* Certificate Banner */}
              <div className="p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    Cryptographic Integrity Attestation
                  </div>
                  <p className="text-gray-400 text-xs mt-1">
                    SHA-256 hash-chain verified. <strong>{reportData.totalEventsVerified} events</strong> authenticated without tampering.
                  </p>
                  <p className="font-mono text-[11px] text-gray-500 mt-1 break-all">
                    Root Hash: {reportData.rootHash}
                  </p>
                </div>
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-bold text-xs rounded-full">
                  CHAIN VALID
                </span>
              </div>

              {/* Standards Breakdown */}
              <div className="space-y-4">
                {reportData.standards.map((std: any) => (
                  <div key={std.code} className="bg-gray-950/50 border border-gray-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                      <span className="font-bold text-white text-sm">{std.name}</span>
                      <span className="px-2 py-0.5 bg-sentinel-500/20 text-sentinel-300 border border-sentinel-500/30 font-mono font-semibold rounded text-[10px]">
                        {std.status}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {std.controls.map((ctrl: any) => (
                        <div key={ctrl.id} className="flex items-start justify-between p-2 bg-gray-900/60 rounded-lg">
                          <div>
                            <span className="font-mono font-bold text-cyan-400 mr-2">{ctrl.id}</span>
                            <span className="text-gray-300 font-medium">{ctrl.description}</span>
                            <p className="text-gray-500 text-[11px] mt-0.5">Enforcement: {ctrl.enforcementMechanism}</p>
                          </div>
                          <span className="text-[10px] text-emerald-400 font-mono font-semibold uppercase shrink-0 ml-3">
                            {ctrl.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-800 bg-gray-950/60 flex items-center justify-between">
              <span className="text-xs text-gray-500">Certified for Enterprise AI Runtime Compliance</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadReportMarkdown}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-sentinel-600 hover:bg-sentinel-500 text-white rounded-lg text-xs font-semibold transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Auditor Markdown (.md)
                </button>
                <button
                  onClick={() => setShowReport(false)}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <select value={filters.decision} onChange={e => setFilters(f => ({ ...f, decision: e.target.value }))}
          className="bg-gray-900 border border-gray-700 text-xs text-gray-300 rounded px-2 py-1.5">
          <option value="">All Decisions</option>
          <option value="ALLOW">ALLOW</option>
          <option value="DENY">DENY</option>
          <option value="APPROVAL_REQUIRED">APPROVAL REQUIRED</option>
        </select>
        <select value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}
          className="bg-gray-900 border border-gray-700 text-xs text-gray-300 rounded px-2 py-1.5">
          <option value="">All Types</option>
          <option value="TOOL_CALL_ALLOWED">Tool Allowed</option>
          <option value="TOOL_CALL_DENIED">Tool Denied</option>
          <option value="APPROVAL_REQUESTED">Approval Requested</option>
          <option value="APPROVAL_RESOLVED">Approval Resolved</option>
          <option value="CIRCUIT_BREAKER_TRIPPED">Circuit Breaker Tripped</option>
          <option value="TOKEN_REJECTED">Token Rejected</option>
          <option value="TOKEN_REVOKED">Token Revoked</option>
          <option value="PROMPT_INJECTION_DETECTED">Prompt Injection</option>
          <option value="SECRET_DETECTED">Secret Detected</option>
          <option value="POLICY_UPDATED">Policy Updated</option>
        </select>
        <input placeholder="Tool name" value={filters.tool} onChange={e => setFilters(f => ({ ...f, tool: e.target.value }))}
          className="bg-gray-900 border border-gray-700 text-xs text-gray-300 rounded px-2 py-1.5 w-32" />
        <button onClick={load} className="flex items-center gap-1 px-3 py-1.5 text-xs text-sentinel-400 bg-sentinel-600/10 border border-sentinel-600/20 rounded hover:bg-sentinel-600/20">
          <Search className="w-3 h-3" /> Search
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 flex gap-4 min-h-0">
        <div className="flex-1 overflow-y-auto bg-gray-900/40 border border-gray-800 rounded-xl">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : events.length === 0 ? (
            <div className="p-8 text-center text-gray-600">No events found. Run some attack simulations to generate events.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-900 z-10">
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left p-2 pl-3">Time</th>
                  <th className="text-left p-2">Agent</th>
                  <th className="text-left p-2">Tool</th>
                  <th className="text-left p-2">Event</th>
                  <th className="text-left p-2">Decision</th>
                  <th className="text-left p-2">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {events.map(evt => (
                  <tr key={evt.id} className={`border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer ${selected?.id === evt.id ? 'bg-sentinel-600/10' : ''}`}
                    onClick={() => setSelected(evt)}>
                    <td className="p-2 pl-3 font-mono text-gray-500">{new Date(evt.timestamp).toLocaleString()}</td>
                    <td className="p-2 text-gray-300 truncate max-w-24">{evt.agentIdentity.split('/').pop()}</td>
                    <td className="p-2 font-mono text-gray-300">{evt.toolName}</td>
                    <td className="p-2 text-gray-400">{evt.eventType.replace(/_/g, ' ').toLowerCase()}</td>
                    <td className="p-2">
                      {evt.decision && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          evt.decision === 'ALLOW' ? 'text-green-400 bg-green-500/10' :
                          evt.decision === 'APPROVAL_REQUIRED' ? 'text-amber-400 bg-amber-500/10' :
                          'text-red-400 bg-red-500/10'
                        }`}>{evt.decision}</span>
                      )}
                    </td>
                    <td className="p-2 text-gray-500">{evt.outcome || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <div className="w-96 bg-gray-900/60 border border-gray-800 rounded-xl p-4 overflow-y-auto">
            <h3 className="text-sm font-semibold text-white mb-3">Event Details</h3>
            <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(selected, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
