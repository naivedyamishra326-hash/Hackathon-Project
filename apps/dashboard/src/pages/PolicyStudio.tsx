import { useState, useEffect } from 'react';
import { api, type PolicyFile } from '../api.ts';
import { FileText, Check, X, Save, RotateCcw, Sparkles, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';

export default function PolicyStudio() {
  const [policies, setPolicies] = useState<PolicyFile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [validation, setValidation] = useState<{ valid?: boolean; errors?: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Cedar Copilot State
  const [showCopilot, setShowCopilot] = useState(false);
  const [copilotPrompt, setCopilotPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copilotResult, setCopilotResult] = useState<{
    generatedPolicy?: string;
    explanation?: string;
    valid?: boolean;
    errors?: string[];
  } | null>(null);

  useEffect(() => {
    api.getPolicies().then(r => {
      setPolicies(r.policies);
      if (r.policies.length > 0) {
        setSelected(r.policies[0].name);
        setEditContent(r.policies[0].content);
      }
    }).catch(console.error);
  }, []);

  const selectPolicy = (name: string) => {
    const p = policies.find(pol => pol.name === name);
    if (p) { setSelected(name); setEditContent(p.content); setValidation(null); setMessage(''); }
  };

  const handleValidate = async () => {
    const result = await api.validatePolicy(editContent);
    setValidation(result);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const result = await api.updatePolicy(selected, editContent);
      if (result.success) {
        setMessage('Policy updated successfully');
        setValidation({ valid: true, errors: [] });
        const r = await api.getPolicies();
        setPolicies(r.policies);
      } else {
        setMessage(`Failed: ${result.errors?.join(', ')}`);
        setValidation({ valid: false, errors: result.errors });
      }
    } catch (err) {
      setMessage(`Error: ${err}`);
    }
    setSaving(false);
  };

  const handleReset = () => {
    const p = policies.find(pol => pol.name === selected);
    if (p) { setEditContent(p.content); setValidation(null); setMessage(''); }
  };

  const handleGeneratePolicy = async () => {
    if (!copilotPrompt.trim()) return;
    setGenerating(true);
    try {
      const res = await api.generatePolicy(copilotPrompt);
      setCopilotResult(res);
    } catch (err) {
      setCopilotResult({ valid: false, errors: [String(err)] });
    }
    setGenerating(false);
  };

  const handleInsertCopilot = () => {
    if (!copilotResult?.generatedPolicy) return;
    setEditContent(prev => prev + '\n\n' + copilotResult.generatedPolicy);
    setShowCopilot(false);
    setMessage('Policy inserted from Cedar Copilot! Click Save to apply.');
  };

  const examplePrompts = [
    'Allow financial remediation agent to issue refunds up to $75 only on active accounts',
    'Block all refunds and account reads on suspended accounts',
    'Forbid shell command execution and bash execution for all agents',
    'Allow read-only analyst to read active accounts only',
  ];

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Policy Studio</h2>
          <p className="text-sm text-gray-500 mt-1">Inspect, edit, and synthesize Cedar authorization policies</p>
        </div>
        <button
          onClick={() => setShowCopilot(!showCopilot)}
          className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-sentinel-600 to-indigo-600 hover:from-sentinel-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-sentinel-900/30 transition"
        >
          <Sparkles className="w-4 h-4 text-cyan-300" />
          Cedar Copilot (Natural Language)
        </button>
      </div>

      {/* Cedar Copilot Panel */}
      {showCopilot && (
        <div className="mt-4 p-4 bg-gray-900/80 border border-sentinel-600/40 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sentinel-400" />
              Cedar Copilot — Natural Language to Verified Policy
            </h3>
            <button onClick={() => setShowCopilot(false)} className="text-xs text-gray-400 hover:text-white">✕ Close</button>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={copilotPrompt}
              onChange={(e) => setCopilotPrompt(e.target.value)}
              placeholder="e.g. Allow financial agent to issue refund up to $100 on active accounts"
              className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-sentinel-500 font-mono"
              onKeyDown={(e) => e.key === 'Enter' && handleGeneratePolicy()}
            />
            <button
              onClick={handleGeneratePolicy}
              disabled={generating}
              className="px-4 py-2 bg-sentinel-600 hover:bg-sentinel-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
            >
              {generating ? 'Compiling...' : 'Synthesize Cedar'}
            </button>
          </div>

          {/* Quick Example Pills */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] text-gray-500 uppercase font-mono mr-1">Examples:</span>
            {examplePrompts.map((p, i) => (
              <button
                key={i}
                onClick={() => setCopilotPrompt(p)}
                className="text-[11px] bg-gray-800/80 hover:bg-gray-750 text-gray-300 hover:text-white px-2 py-1 rounded border border-gray-700/50 transition text-left"
              >
                {p}
              </button>
            ))}
          </div>

          {/* Generated Result */}
          {copilotResult && (
            <div className="mt-3 p-3 bg-gray-950/90 border border-gray-800 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                  {copilotResult.valid ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                  )}
                  {copilotResult.explanation}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                  copilotResult.valid ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}>
                  {copilotResult.valid ? 'CEDAR VALIDATED' : 'SYNTAX ERROR'}
                </span>
              </div>

              {copilotResult.generatedPolicy && (
                <pre className="p-2.5 bg-gray-900 rounded font-mono text-xs text-cyan-300 overflow-x-auto border border-gray-800">
                  {copilotResult.generatedPolicy}
                </pre>
              )}

              {copilotResult.valid && (
                <button
                  onClick={handleInsertCopilot}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold transition"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  Insert into Active Policy Editor
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Studio Area */}
      <div className="flex-1 flex gap-4 mt-4 min-h-0">
        {/* Policy List */}
        <div className="w-48 bg-gray-900/40 border border-gray-800 rounded-xl p-3">
          <h3 className="text-xs font-semibold text-gray-500 mb-2">POLICY FILES</h3>
          {policies.map(p => (
            <button
              key={p.name}
              onClick={() => selectPolicy(p.name)}
              className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-xs mb-1 transition-smooth ${
                selected === p.name
                  ? 'bg-sentinel-600/20 text-sentinel-400'
                  : 'text-gray-400 hover:bg-gray-800'
              }`}
            >
              <FileText className="w-3 h-3" />
              {p.name}
            </button>
          ))}
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col bg-gray-900/40 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900/60">
            <span className="text-xs font-mono text-gray-400">{selected || 'No policy selected'}</span>
            <div className="flex items-center gap-2">
              <button onClick={handleReset} className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white bg-gray-800 rounded">
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
              <button onClick={handleValidate} className="flex items-center gap-1 px-2 py-1 text-xs text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 rounded">
                <Check className="w-3 h-3" /> Validate
              </button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-2 py-1 text-xs text-green-400 hover:text-green-300 bg-green-500/10 border border-green-500/20 rounded disabled:opacity-50">
                <Save className="w-3 h-3" /> {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="flex-1 p-4 bg-transparent text-gray-200 font-mono text-xs resize-none focus:outline-none leading-relaxed"
            spellCheck={false}
          />

          {/* Status Bar */}
          <div className="px-4 py-2 border-t border-gray-800 bg-gray-900/60 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              {validation && (
                validation.valid ? (
                  <span className="flex items-center gap-1 text-green-400">
                    <Check className="w-3 h-3" /> Valid Cedar Policy
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-400">
                    <X className="w-3 h-3" /> {validation.errors?.join(', ') || 'Validation error'}
                  </span>
                )
              )}
              {message && <span className="text-gray-400">{message}</span>}
            </div>
            <span className="text-gray-500 font-mono">{editContent.split('\n').length} lines</span>
          </div>
        </div>
      </div>
    </div>
  );
}
