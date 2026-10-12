import { useState, useEffect, useRef } from 'react';
import { api, useSSE, type AuditEvent } from '../api.ts';
import { Radio, Eye } from 'lucide-react';

const decisionColor: Record<string, string> = {
  ALLOW: 'text-green-400 bg-green-500/10 border-green-500/20',
  DENY: 'text-red-400 bg-red-500/10 border-red-500/20',
};

const typeColor: Record<string, string> = {
  TOOL_CALL_ALLOWED: 'text-green-400',
  TOOL_CALL_DENIED: 'text-red-400',
  TOKEN_REJECTED: 'text-red-400',
  PROMPT_INJECTION_DETECTED: 'text-orange-400',
  SECRET_DETECTED: 'text-yellow-400',
  CAPABILITY_VIOLATION: 'text-red-400',
  TOKEN_REVOKED: 'text-purple-400',
  TOKEN_ISSUED: 'text-blue-400',
  POLICY_UPDATED: 'text-cyan-400',
  TOOL_DISCOVERY: 'text-gray-400',
  DELEGATION_CREATED: 'text-indigo-400',
};

export default function LiveMonitor() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [live, setLive] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getEvents({ limit: '50' }).then(r => setEvents(r.events.reverse())).catch(console.error);
  }, []);

  const sse = useSSE((data) => {
    if (data.type === 'audit_event' && data.data) {
      setEvents(prev => [...prev.slice(-200), data.data as AuditEvent]);
    }
  });

  useEffect(() => {
    if (live) sse.connect();
    return () => sse.disconnect();
  }, [live]);

  useEffect(() => {
    if (live) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events, live]);

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-white">Live Request Monitor</h2>
          <p className="text-sm text-gray-500">Real-time security event stream</p>
        </div>
        <button
          onClick={() => setLive(l => !l)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${
            live ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-400'
          }`}
        >
          <Radio className="w-3 h-3" />
          {live ? 'LIVE' : 'PAUSED'}
        </button>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Event List */}
        <div className="flex-1 overflow-y-auto bg-gray-900/40 border border-gray-800 rounded-xl">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-900 z-10">
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="text-left p-2 pl-3">Time</th>
                <th className="text-left p-2">Agent</th>
                <th className="text-left p-2">Tool</th>
                <th className="text-left p-2">Type</th>
                <th className="text-left p-2">Decision</th>
                <th className="text-left p-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {events.map((evt) => (
                <tr
                  key={evt.id}
                  className={`border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer transition-smooth ${
                    selected?.id === evt.id ? 'bg-sentinel-600/10' : ''
                  }`}
                  onClick={() => setSelected(evt)}
                >
                  <td className="p-2 pl-3 font-mono text-gray-500">{new Date(evt.timestamp).toLocaleTimeString()}</td>
                  <td className="p-2 text-gray-300 truncate max-w-32">{evt.agentIdentity.split('/').pop()}</td>
                  <td className="p-2 text-gray-300 font-mono">{evt.toolName}</td>
                  <td className={`p-2 ${typeColor[evt.eventType] || 'text-gray-400'}`}>
                    {evt.eventType.replace(/_/g, ' ').toLowerCase()}
                  </td>
                  <td className="p-2">
                    {evt.decision && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${decisionColor[evt.decision] || ''}`}>
                        {evt.decision}
                      </span>
                    )}
                  </td>
                  <td className="p-2"><Eye className="w-3 h-3 text-gray-600" /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div ref={bottomRef} />
        </div>

        {/* Detail Panel */}
        {selected && (
          <div className="w-96 bg-gray-900/60 border border-gray-800 rounded-xl p-4 overflow-y-auto">
            <h3 className="text-sm font-semibold text-white mb-3">Event Details</h3>
            <dl className="space-y-2 text-xs">
              {Object.entries(selected).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-gray-500 font-medium">{k}</dt>
                  <dd className="text-gray-300 font-mono break-all mt-0.5">
                    {typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v ?? '')}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
