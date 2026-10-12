import { useState, useEffect } from 'react';
import { api, type DemoIdentity } from '../api.ts';
import { Key, ShieldCheck, ShieldX, GitBranch, Plus, Trash2 } from 'lucide-react';

export default function IdentityView() {
  const [identities, setIdentities] = useState<DemoIdentity[]>([]);
  const [delegations, setDelegations] = useState<any[]>([]);
  const [revocations, setRevocations] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  const load = async () => {
    try {
      const [id, del, rev] = await Promise.all([api.getIdentities(), api.getDelegations(), api.getRevocations()]);
      setIdentities(id.identities);
      setDelegations(del.delegations);
      setRevocations(rev.revocations);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { load(); }, []);

  const handleIssueToken = async (subject: string) => {
    try {
      const caps = subject.includes('read-only') ? ['ledger.read', 'customer.read'] : ['ledger.read', 'customer.read', 'ledger.refund'];
      await api.issueToken({
        subject,
        capabilities: caps,
        authorizedResources: ['ACC-1001'],
        maxRefundAmount: 50,
        ttlSeconds: 300,
      });
      setMessage(`Token issued for ${subject.split('/').pop()}`);
      load();
    } catch (err) { setMessage(`Error: ${err}`); }
  };

  const handleRevoke = async (tokenId: string) => {
    try {
      await api.revokeToken(tokenId, 'Manual revocation from dashboard');
      setMessage(`Token ${tokenId.slice(0, 12)}... revoked`);
      load();
    } catch (err) { setMessage(`Error: ${err}`); }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Identity & Delegation</h2>
        <p className="text-sm text-gray-500 mt-1">Demonstration agent identities, tokens, and delegation chains</p>
        <p className="text-[10px] text-yellow-600 mt-1 bg-yellow-500/5 border border-yellow-500/20 px-2 py-1 rounded inline-block">
          ⚠ Local demo identity provider — not SPIRE workload attestation
        </p>
      </div>

      {message && (
        <div className="text-xs text-sentinel-400 bg-sentinel-500/10 border border-sentinel-500/20 px-3 py-2 rounded-lg">{message}</div>
      )}

      {/* Identities */}
      <div className="space-y-3">
        {identities.map(id => (
          <div key={id.uri} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-sentinel-400" />
                <span className="text-sm font-semibold text-white">{id.name.replace(/_/g, ' ')}</span>
                <span className="text-xs font-mono text-gray-500">{id.uri}</span>
              </div>
              <button onClick={() => handleIssueToken(id.uri)} className="flex items-center gap-1 px-2 py-1 text-xs bg-sentinel-600/20 text-sentinel-400 border border-sentinel-600/30 rounded hover:bg-sentinel-600/30">
                <Plus className="w-3 h-3" /> Issue Token
              </button>
            </div>
            {id.tokens.length > 0 ? (
              <div className="space-y-2">
                {id.tokens.map((tok: any) => (
                  <div key={tok.id} className={`flex items-center justify-between text-xs p-2 rounded border ${
                    tok.revoked ? 'bg-red-500/5 border-red-500/20' : 'bg-gray-800/50 border-gray-700/50'
                  }`}>
                    <div className="flex items-center gap-3">
                      {tok.revoked ? <ShieldX className="w-3 h-3 text-red-400" /> : <ShieldCheck className="w-3 h-3 text-green-400" />}
                      <span className="font-mono text-gray-400">{tok.id.slice(0, 16)}...</span>
                      <span className="text-gray-500">caps: {tok.capabilities?.join(', ')}</span>
                      {tok.maxRefundAmount && <span className="text-gray-500">max: ${tok.maxRefundAmount}</span>}
                    </div>
                    {!tok.revoked && (
                      <button onClick={() => handleRevoke(tok.id)} className="flex items-center gap-1 px-1.5 py-0.5 text-red-400 hover:bg-red-500/10 rounded">
                        <Trash2 className="w-3 h-3" /> Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-600">No active tokens</p>
            )}
          </div>
        ))}
      </div>

      {/* Delegations */}
      {delegations.length > 0 && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-3">
            <GitBranch className="w-4 h-4 text-indigo-400" /> Delegation Chains
          </h3>
          <div className="space-y-2">
            {delegations.map((d: any) => (
              <div key={d.id} className="text-xs p-2 bg-gray-800/40 rounded border border-gray-700/50">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">{d.parentIdentity?.split('/').pop()}</span>
                  <span className="text-gray-600">→</span>
                  <span className="text-indigo-400">{d.childIdentity?.split('/').pop()}</span>
                  <span className={`px-1 py-0.5 rounded text-[10px] ${d.revoked ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                    {d.revoked ? 'REVOKED' : 'ACTIVE'}
                  </span>
                </div>
                <div className="text-gray-500 mt-1">
                  Child caps: {d.childCapabilities?.join(', ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
