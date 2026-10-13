import React, { useState, useEffect, useRef } from 'react';
import {
  Bot, User, Send, Shield, AlertTriangle, CheckCircle, Clock,
  RefreshCw, DollarSign, Sparkles, ChevronDown, ChevronUp, Lock,
  FileText, ShieldAlert, Check, X, ArrowRight, RotateCcw
} from 'lucide-react';
import { api } from '../api';

interface ToolActivity {
  toolName: string;
  args: Record<string, unknown>;
  output: unknown;
  isError?: boolean;
  securityDecision?: {
    decision: string;
    reason?: string;
    policyId?: string;
    correlationId: string;
    riskScore: number;
    taintMarkers?: string[];
    evaluationTimeMs?: number;
  };
}

interface PendingRefund {
  confirmationId: string;
  transactionId: string;
  accountId: string;
  amount: number;
  currency: string;
  reason: string;
  createdAt: string;
  expiresAt: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'EXPIRED';
  executionResult?: any;
}

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  toolActivities?: ToolActivity[];
  pendingRefund?: PendingRefund | null;
}

export const FinanceBot: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: "Hello! I am the **MCP Sentinel AI Finance Assistant**, powered by Google Gemini and secured with real-time Cedar authorization.\n\nI can look up customer accounts, review transaction histories, investigate suspicious memos for prompt injections, and prepare refunds with mandatory human confirmation.\n\nHow can I help you today?",
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState('ACC-1001');
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const [status, setStatus] = useState<any>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<string>('');
  const [refreshed, setRefreshed] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [confirmingRefund, setConfirmingRefund] = useState<Record<string, boolean>>({});
  const [refundResults, setRefundResults] = useState<Record<string, any>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleResetDemoState = async () => {
    try {
      setResetting(true);
      await api.resetFinance();
      setMessages([
        {
          id: `welcome-${Date.now()}`,
          role: 'model',
          text: 'Hello! The demo ledger, transaction records, and conversation history have been reset to their clean initial state. All transactions (including TXN-2002) are now back in their unrefunded state and eligible for testing. How can I help you?',
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
      setExpandedTools({});
      setConfirmingRefund({});
      setRefundResults({});
      await loadStatus();
    } catch (err: any) {
      console.error('Failed to reset demo state:', err);
    } finally {
      setResetting(false);
    }
  };

  const loadStatus = async () => {
    try {
      setStatusLoading(true);
      const startTime = Date.now();
      const res = await api.getFinanceStatus();
      setStatus(res);
      setLastChecked(new Date().toLocaleTimeString());
      
      // Ensure visible feedback duration (at least 450ms)
      const elapsed = Date.now() - startTime;
      if (elapsed < 450) {
        await new Promise(r => setTimeout(r, 450 - elapsed));
      }
      setRefreshed(true);
      setTimeout(() => setRefreshed(false), 2500);
    } catch {
      setStatus({ configured: false, message: 'Could not fetch status' });
      setLastChecked(new Date().toLocaleTimeString());
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (messageText?: string) => {
    const textToSend = messageText || input;
    if (!textToSend.trim() || loading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages(prev => [...prev, userMessage]);
    if (!messageText) setInput('');
    setLoading(true);

    try {
      const res = await api.sendFinanceChat(textToSend, sessionId, selectedAccount);
      const botMessage: Message = {
        id: `bot-${Date.now()}`,
        role: 'model',
        text: res.response || 'No response produced.',
        timestamp: new Date().toLocaleTimeString(),
        toolActivities: res.toolActivities || [],
        pendingRefund: res.pendingRefund || null,
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'model',
          text: `⚠️ **Error communicating with Finance Bot:** ${err.message || 'Unknown network error'}.`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmRefund = async (confirmationId: string) => {
    setConfirmingRefund(prev => ({ ...prev, [confirmationId]: true }));
    try {
      const res = await api.confirmRefund(confirmationId);
      setRefundResults(prev => ({
        ...prev,
        [confirmationId]: {
          success: true,
          message: res.message || 'Refund successfully processed',
          data: res.executionResult,
        },
      }));
    } catch (err: any) {
      setRefundResults(prev => ({
        ...prev,
        [confirmationId]: {
          success: false,
          message: err.message || 'Refund was denied by Cedar policy or security rules',
        },
      }));
    } finally {
      setConfirmingRefund(prev => ({ ...prev, [confirmationId]: false }));
    }
  };

  const handleRejectRefund = async (confirmationId: string) => {
    setConfirmingRefund(prev => ({ ...prev, [confirmationId]: true }));
    try {
      const res = await api.rejectRefund(confirmationId);
      setRefundResults(prev => ({
        ...prev,
        [confirmationId]: {
          success: false,
          rejected: true,
          message: res.message || 'Refund proposal rejected. Ledger remains unchanged.',
        },
      }));
    } catch (err: any) {
      setRefundResults(prev => ({
        ...prev,
        [confirmationId]: {
          success: false,
          message: err.message || 'Failed to reject refund',
        },
      }));
    } finally {
      setConfirmingRefund(prev => ({ ...prev, [confirmationId]: false }));
    }
  };

  const toggleToolExpand = (id: string) => {
    setExpandedTools(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const quickPrompts = [
    { label: 'Review TXN-2002', prompt: 'Review transaction TXN-2002 for account ACC-1001.' },
    { label: 'Check Refund Eligibility', prompt: 'Check if transaction TXN-2002 is eligible for a refund.' },
    { label: 'Prepare $29.50 Refund', prompt: 'Please prepare a refund of $29.50 for transaction TXN-2002 on account ACC-1001. Reason: Disputed charge.' },
    { label: 'Investigate Suspicious Memo (TXN-2005)', prompt: 'Analyze transaction TXN-2005 for suspicious activity.' },
    { label: 'Check Balance for ACC-1001', prompt: 'Show me the account details and balance for ACC-1001.' },
    { label: 'Cross-Account Access Test (ACC-1002)', prompt: 'Show me transaction TXN-2003 for account ACC-1001.' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header & Status Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/40 rounded-xl shadow-inner">
              <Bot className="w-7 h-7 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold text-white tracking-wide">AI Finance Assistant</h1>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  Google Gemini + ZTAS
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-0.5">
                Real-time Zero-Trust MCP tool mediation, Cedar ABAC authorization, and HITL refund approval.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Account Selector */}
            <div className="flex items-center space-x-2 bg-slate-800/80 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs">
              <span className="text-slate-400">Context:</span>
              <select
                value={selectedAccount}
                onChange={e => setSelectedAccount(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
              >
                <option value="ACC-1001" className="bg-slate-800">ACC-1001 (Alice Johnson - $5,420.50)</option>
                <option value="ACC-1002" className="bg-slate-800">ACC-1002 (Bob Smith - $12,750.00)</option>
                <option value="ACC-1003" className="bg-slate-800">ACC-1003 (Carol - Suspended)</option>
                <option value="ACC-1004" className="bg-slate-800">ACC-1004 (David Brown - $32,100.00)</option>
              </select>
            </div>

            {/* Model Status Badge */}
            <div className="flex items-center space-x-2 bg-slate-800/80 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs">
              {status?.configured ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-emerald-300 font-medium">{status.model || 'gemini-3.5-flash'}</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-amber-300 font-medium">Gemini Not Configured</span>
                </>
              )}
            </div>

            <button
              id="refresh-status-btn"
              onClick={loadStatus}
              disabled={statusLoading}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer active:scale-95 disabled:opacity-50 ${
                refreshed
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                  : 'bg-slate-800/90 hover:bg-slate-700/80 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title="Refresh status"
            >
              {refreshed ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Refreshed!</span>
                </>
              ) : (
                <>
                  <RefreshCw className={`w-3.5 h-3.5 ${statusLoading ? 'animate-spin text-indigo-400' : ''}`} />
                  <span>{statusLoading ? 'Checking...' : 'Refresh'}</span>
                </>
              )}
            </button>

            <button
              id="reset-demo-btn"
              onClick={handleResetDemoState}
              disabled={resetting}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium bg-rose-950/40 hover:bg-rose-900/60 border-rose-800/60 text-rose-300 hover:text-white transition cursor-pointer active:scale-95 disabled:opacity-50"
              title="Reset simulated fintech ledger, refund statuses, and chat conversation back to clean initial state"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin text-rose-400' : ''}`} />
              <span>{resetting ? 'Resetting...' : 'Reset Demo State'}</span>
            </button>
          </div>
        </div>

        {/* Quick Warning if Gemini missing */}
        {status && !status.configured && (
          <div className="mt-4 p-3 bg-amber-950/40 border border-amber-600/40 rounded-lg flex items-center space-x-3 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Gemini API Key Required:</strong> Add <code>GEMINI_API_KEY</code> to <code>.env</code> in the project root to enable real Gemini live responses.
            </span>
          </div>
        )}
      </div>

      {/* Quick Prompts Bar */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs">
        <span className="text-slate-400 flex items-center shrink-0 mr-1">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400 mr-1" /> Quick Queries:
        </span>
        {quickPrompts.map((qp, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(qp.prompt)}
            disabled={loading}
            className="px-3 py-1.5 bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/60 hover:border-indigo-500/50 rounded-full text-slate-300 hover:text-white shrink-0 transition"
          >
            {qp.label}
          </button>
        ))}
      </div>

      {/* Chat Messages Container */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 min-h-[480px] max-h-[640px] overflow-y-auto space-y-6 backdrop-blur-sm">
        {messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          return (
            <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex space-x-3 max-w-3xl ${isUser ? 'flex-row-reverse space-x-reverse' : 'flex-row'}`}>
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-md ${
                  isUser
                    ? 'bg-blue-600 text-white'
                    : 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white'
                }`}>
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                {/* Content Bubble */}
                <div className="space-y-3">
                  <div className={`p-4 rounded-2xl shadow-lg text-sm leading-relaxed ${
                    isUser
                      ? 'bg-blue-600/90 text-white rounded-tr-none'
                      : 'bg-slate-800/90 text-slate-100 border border-slate-700/60 rounded-tl-none'
                  }`}>
                    {/* Render text with basic markdown formatting */}
                    <div className="whitespace-pre-wrap space-y-2">
                      {msg.text.split('\n\n').map((para, i) => (
                        <p key={i}>
                          {para.split('**').map((chunk, j) =>
                            j % 2 === 1 ? <strong key={j} className="font-semibold text-white">{chunk}</strong> : chunk
                          )}
                        </p>
                      ))}
                    </div>

                    <div className={`text-[10px] mt-2 ${isUser ? 'text-blue-200' : 'text-slate-400'} text-right`}>
                      {msg.timestamp}
                    </div>
                  </div>

                  {/* Tool Activities Card Accordion */}
                  {msg.toolActivities && msg.toolActivities.length > 0 && (
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-slate-400 font-medium">
                        <div className="flex items-center space-x-2">
                          <Shield className="w-4 h-4 text-indigo-400" />
                          <span>MCP Sentinel Security Interception ({msg.toolActivities.length} tool calls)</span>
                        </div>
                        <span className="text-[11px] text-slate-500 font-mono">Zero-Trust Pipeline</span>
                      </div>

                      <div className="space-y-2 pt-1">
                        {msg.toolActivities.map((tool, tIdx) => {
                          const toolId = `${msg.id}-tool-${tIdx}`;
                          const isExpanded = expandedTools[toolId];
                          const decision = tool.securityDecision?.decision || (tool.isError ? 'DENY' : 'ALLOW');
                          const isAllowed = decision === 'ALLOW';

                          return (
                            <div key={tIdx} className="bg-slate-900/90 border border-slate-800 rounded-lg overflow-hidden">
                              <div
                                onClick={() => toggleToolExpand(toolId)}
                                className="p-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-800/50 transition"
                              >
                                <div className="flex items-center space-x-2">
                                  <span className="font-mono font-bold text-indigo-300">{tool.toolName}</span>
                                  <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
                                    isAllowed
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                  }`}>
                                    {decision}
                                  </span>
                                  {tool.securityDecision?.policyId && (
                                    <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                                      {tool.securityDecision.policyId}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center space-x-3 text-slate-400">
                                  {tool.securityDecision?.taintMarkers && tool.securityDecision.taintMarkers.length > 0 && (
                                    <span className="flex items-center text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded font-bold">
                                      <ShieldAlert className="w-3 h-3 mr-1" />
                                      {tool.securityDecision.taintMarkers.join(', ')}
                                    </span>
                                  )}
                                  {tool.securityDecision?.evaluationTimeMs && (
                                    <span className="text-[10px] text-slate-500 font-mono">
                                      {tool.securityDecision.evaluationTimeMs.toFixed(1)}ms
                                    </span>
                                  )}
                                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </div>
                              </div>

                              {/* Expanded Tool Details */}
                              {isExpanded && (
                                <div className="p-3 bg-slate-950 border-t border-slate-800/80 font-mono text-[11px] space-y-2">
                                  <div>
                                    <span className="text-slate-400 font-sans block mb-1">Inputs:</span>
                                    <pre className="bg-slate-900 p-2 rounded text-slate-300 overflow-x-auto">
                                      {JSON.stringify(tool.args, null, 2)}
                                    </pre>
                                  </div>

                                  <div>
                                    <span className="text-slate-400 font-sans block mb-1">Tool Output (Sanitized):</span>
                                    <pre className="bg-slate-900 p-2 rounded text-slate-300 overflow-x-auto">
                                      {typeof tool.output === 'string' ? tool.output : JSON.stringify(tool.output, null, 2)}
                                    </pre>
                                  </div>

                                  {tool.securityDecision && (
                                    <div className="pt-1 flex items-center justify-between text-[10px] text-slate-400 font-sans">
                                      <span>Correlation ID: <code>{tool.securityDecision.correlationId}</code></span>
                                      <span>Risk Score: <strong className={tool.securityDecision.riskScore > 50 ? 'text-rose-400' : 'text-emerald-400'}>{tool.securityDecision.riskScore} / 100</strong></span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Refund Confirmation Card */}
                  {msg.pendingRefund && (
                    <div className="bg-gradient-to-br from-amber-950/50 via-slate-900 to-slate-950 border-2 border-amber-500/50 rounded-xl p-4 shadow-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                          <DollarSign className="w-5 h-5 text-amber-400" />
                          <span>Human-in-the-Loop Refund Confirmation Required</span>
                        </div>
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          PENDING APPROVAL
                        </span>
                      </div>

                      <p className="text-xs text-slate-300">
                        The AI Finance Agent has prepared this refund. In compliance with enterprise Zero-Trust policy,
                        it cannot execute without your explicit supervisor confirmation:
                      </p>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                        <div>
                          <span className="text-slate-500 block text-[10px]">Transaction ID</span>
                          <span className="text-white font-mono font-bold">{msg.pendingRefund.transactionId}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Account ID</span>
                          <span className="text-white font-mono font-bold">{msg.pendingRefund.accountId}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Amount</span>
                          <span className="text-emerald-400 font-mono font-bold text-sm">
                            ${msg.pendingRefund.amount} {msg.pendingRefund.currency}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Reason</span>
                          <span className="text-slate-300">{msg.pendingRefund.reason}</span>
                        </div>
                      </div>

                      {/* Execution Result Banner if already acted on */}
                      {refundResults[msg.pendingRefund.confirmationId] ? (
                        <div className={`p-3 rounded-lg border text-xs ${
                          refundResults[msg.pendingRefund.confirmationId].success
                            ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200'
                            : 'bg-rose-950/50 border-rose-500/50 text-rose-200'
                        }`}>
                          <div className="flex items-center space-x-2 font-bold mb-1">
                            {refundResults[msg.pendingRefund.confirmationId].success ? (
                              <CheckCircle className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-rose-400" />
                            )}
                            <span>{refundResults[msg.pendingRefund.confirmationId].message}</span>
                          </div>
                          {refundResults[msg.pendingRefund.confirmationId].data && (
                            <pre className="text-[10px] font-mono bg-slate-950/80 p-2 rounded mt-1 overflow-x-auto text-slate-300">
                              {JSON.stringify(refundResults[msg.pendingRefund.confirmationId].data, null, 2)}
                            </pre>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center space-x-3 pt-1">
                          <button
                            onClick={() => handleConfirmRefund(msg.pendingRefund!.confirmationId)}
                            disabled={confirmingRefund[msg.pendingRefund.confirmationId]}
                            className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs shadow-lg shadow-emerald-900/30 transition disabled:opacity-50"
                          >
                            <Check className="w-4 h-4" />
                            <span>Confirm & Execute via MCP Sentinel</span>
                          </button>

                          <button
                            onClick={() => handleRejectRefund(msg.pendingRefund!.confirmationId)}
                            disabled={confirmingRefund[msg.pendingRefund.confirmationId]}
                            className="flex items-center space-x-1.5 px-4 py-2 bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-700 rounded-lg text-xs transition disabled:opacity-50"
                          >
                            <X className="w-4 h-4" />
                            <span>Reject</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {loading && (
          <div className="flex items-center space-x-3 text-slate-400 text-xs py-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md animate-pulse">
              <Bot className="w-4 h-4" />
            </div>
            <div className="flex items-center space-x-2 bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-700/60">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              <span>Gemini is evaluating query & mediating tool calls via MCP Sentinel...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <form
        onSubmit={e => {
          e.preventDefault();
          handleSend();
        }}
        className="flex items-center space-x-3 bg-slate-900/80 border border-slate-800 rounded-xl p-2 shadow-2xl backdrop-blur-md"
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about account balances, transaction analysis, refund preparation, or fraud assessment..."
          disabled={loading}
          className="flex-1 bg-transparent px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none"
        />

        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="flex items-center space-x-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-medium rounded-lg text-sm transition shadow-lg shadow-indigo-950/40 disabled:cursor-not-allowed"
        >
          <span>Send</span>
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
