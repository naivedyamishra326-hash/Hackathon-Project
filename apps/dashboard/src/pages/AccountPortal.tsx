import React, { useState, useEffect } from 'react';
import {
  Landmark, Shield, AlertTriangle, CheckCircle, Clock,
  DollarSign, ArrowUpRight, ArrowDownLeft, RefreshCw, RotateCcw,
  Search, Filter, Lock, Unlock, Sparkles, Bot, AlertOctagon,
  ChevronRight, ExternalLink, X, FileText, Check, ShieldAlert,
  CreditCard, TrendingUp, Zap, HelpCircle
} from 'lucide-react';
import { api } from '../api';
import { useNavigate } from 'react-router-dom';

interface CustomerAccount {
  id: string;
  name: string;
  email: string;
  balance: number;
  currency: string;
  status: 'active' | 'suspended' | 'closed';
  createdAt: string;
  accountNumber?: string;
  routingNumber?: string;
  accountType?: 'checking' | 'savings' | 'investment';
  tier?: string;
  dailyLimit?: number;
  creditScore?: number;
}

interface Transaction {
  id: string;
  accountId: string;
  type: 'credit' | 'debit' | 'refund';
  amount: number;
  currency: string;
  memo: string;
  merchantName?: string;
  timestamp: string;
  status: 'completed' | 'pending' | 'refunded' | 'disputed';
  riskScore?: number;
  category?: string;
  channel?: 'online' | 'in-store' | 'wire' | 'atm';
  location?: string;
  taintMarkers?: string[];
}

export function AccountPortal() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<CustomerAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('ACC-1001');
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  // AI Audit State
  const [aiAuditModalOpen, setAiAuditModalOpen] = useState(false);
  const [aiAuditLoading, setAiAuditLoading] = useState(false);
  const [aiAuditReport, setAiAuditReport] = useState<string | null>(null);

  // Selected Transaction Modal
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [disputeLoading, setDisputeLoading] = useState(false);
  const [disputeSuccess, setDisputeSuccess] = useState<string | null>(null);

  // Resetting demo state
  const [resetting, setResetting] = useState(false);
  const [freezing, setFreezing] = useState(false);

  // Load accounts list
  const loadAccounts = async () => {
    try {
      const res = await api.getAccounts();
      setAccounts(res.accounts || []);
    } catch (err) {
      console.error('Failed to load accounts', err);
    }
  };

  // Load account details & transactions
  const loadAccountData = async (accountId: string) => {
    try {
      setLoading(true);
      const [accRes, txnRes] = await Promise.all([
        api.getAccountDetails(accountId),
        api.getAccountTransactions(accountId, {
          category: selectedCategory !== 'all' ? selectedCategory : undefined,
          status: selectedStatus !== 'all' ? selectedStatus : undefined,
          search: search.trim() ? search.trim() : undefined,
        }),
      ]);
      setAccount(accRes.account);
      setAnalytics(accRes.analytics);
      setTransactions(txnRes.transactions || []);
    } catch (err) {
      console.error('Failed to load account data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    loadAccountData(selectedAccountId);
  }, [selectedAccountId, selectedCategory, selectedStatus, search]);

  const handleToggleFreeze = async () => {
    if (!account) return;
    try {
      setFreezing(true);
      const nextStatus = account.status === 'suspended' ? 'active' : 'suspended';
      const res = await api.setAccountStatus(
        account.id,
        nextStatus,
        `User ${nextStatus === 'suspended' ? 'froze' : 'unfroze'} account from Account Portal`
      );
      if (res.success) {
        setAccount(res.account);
        await loadAccounts();
      }
    } catch (err) {
      console.error('Failed to toggle status', err);
    } finally {
      setFreezing(false);
    }
  };

  const handleResetDemo = async () => {
    try {
      setResetting(true);
      await api.resetFinance();
      await loadAccounts();
      await loadAccountData(selectedAccountId);
    } catch (err) {
      console.error('Failed to reset demo state', err);
    } finally {
      setResetting(false);
    }
  };

  const handleRunAiAudit = async () => {
    try {
      setAiAuditLoading(true);
      setAiAuditModalOpen(true);
      setAiAuditReport(null);
      const res = await api.runAiAudit(selectedAccountId);
      if (res.success) {
        setAiAuditReport(res.report);
      }
    } catch (err: any) {
      setAiAuditReport(`### ⚠️ Audit Error\nFailed to complete AI audit: ${err.message || 'Unknown error'}`);
    } finally {
      setAiAuditLoading(false);
    }
  };

  const handlePrepareDispute = async (txn: Transaction) => {
    try {
      setDisputeLoading(true);
      setDisputeSuccess(null);
      const prompt = `Please prepare a refund of $${txn.amount} for transaction ${txn.id} on account ${txn.accountId}. Reason: Customer dispute via Account Portal.`;
      const res = await api.sendFinanceChat(prompt, `portal-dispute-${Date.now()}`, txn.accountId);
      
      if (res.pendingRefund) {
        setDisputeSuccess(`Refund proposal prepared! Confirmation ID: ${res.pendingRefund.confirmationId}. Directing to AI Finance Bot for supervisor review.`);
      } else {
        setDisputeSuccess(res.response);
      }
    } catch (err: any) {
      setDisputeSuccess(`Dispute preparation failed: ${err.message}`);
    } finally {
      setDisputeLoading(false);
    }
  };

  const categories = [
    'all', 'Subscription', 'Dining', 'Travel', 'Groceries',
    'Retail', 'Electronics', 'Payroll', 'Wire Transfer', 'Crypto'
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Account Switcher */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-indigo-950/60 border border-slate-800 rounded-xl p-5 shadow-xl backdrop-blur-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Landmark className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <h1 className="text-xl font-bold text-white tracking-tight">Fintech Account Management Portal</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center space-x-1">
                  <Shield className="w-3 h-3 text-emerald-400" />
                  <span>Zero-Trust Protected</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Multi-tenant banking ledger with real-time Cedar ABAC authorization and automated AI Copilot
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Account Selector */}
            <div className="flex items-center bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-1.5 text-xs">
              <span className="text-slate-400 mr-2 font-medium">Customer:</span>
              <select
                value={selectedAccountId}
                onChange={e => setSelectedAccountId(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id} className="bg-slate-800 text-white">
                    {acc.id} - {acc.name} ({acc.status === 'suspended' ? '⚠️ Frozen' : `$${acc.balance.toLocaleString()}`})
                  </option>
                ))}
              </select>
            </div>

            {/* AI Audit Button */}
            <button
              onClick={handleRunAiAudit}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 border-indigo-400/40 text-white shadow-md shadow-indigo-600/20 transition cursor-pointer active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-200 animate-pulse" />
              <span>AI Spending & Fraud Audit</span>
            </button>

            {/* Toggle Freeze Button */}
            <button
              onClick={handleToggleFreeze}
              disabled={freezing}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer active:scale-95 ${
                account?.status === 'suspended'
                  ? 'bg-amber-950/60 border-amber-600/60 text-amber-300 hover:bg-amber-900/60'
                  : 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title={account?.status === 'suspended' ? 'Unfreeze account' : 'Freeze account'}
            >
              {account?.status === 'suspended' ? (
                <>
                  <Unlock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Unfreeze Account</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Freeze Account</span>
                </>
              )}
            </button>

            {/* Reset Demo State Button */}
            <button
              onClick={handleResetDemo}
              disabled={resetting}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium bg-rose-950/40 hover:bg-rose-900/60 border-rose-800/60 text-rose-300 hover:text-white transition cursor-pointer active:scale-95"
              title="Reset all ledger accounts and transactions to initial unrefunded state"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
              <span>Reset Demo</span>
            </button>
          </div>
        </div>
      </div>

      {/* Account Hero Cards Grid */}
      {account && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Primary Balance */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4.5 shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-28 h-28 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all pointer-events-none" />
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-medium flex items-center space-x-1">
                <CreditCard className="w-3.5 h-3.5 text-indigo-400" />
                <span>Primary Checking</span>
              </span>
              <span className="font-mono text-slate-500">{account.accountNumber || '•••• 4912'}</span>
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">
              ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              <span className="text-xs font-normal text-slate-400 ml-1.5">{account.currency}</span>
            </div>
            <div className="flex items-center justify-between mt-3 text-xs">
              <span className={`px-2 py-0.5 rounded-full font-medium ${
                account.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                account.status === 'suspended' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' :
                'bg-rose-500/10 text-rose-400 border border-rose-500/30'
              }`}>
                {account.status.toUpperCase()}
              </span>
              <span className="text-slate-400 text-xs">Tier: <strong className="text-slate-200">{account.tier || 'Gold'}</strong></span>
            </div>
          </div>

          {/* Card 2: Monthly Cash Flow */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4.5 shadow-lg relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-medium flex items-center space-x-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>Monthly Cash Flow</span>
              </span>
              <span className="text-xs text-emerald-400 font-mono">
                {analytics?.netCashflow >= 0 ? `+$${analytics?.netCashflow?.toFixed(2)}` : `-$${Math.abs(analytics?.netCashflow)?.toFixed(2)}`}
              </span>
            </div>
            <div className="flex items-baseline space-x-3 mt-1">
              <div>
                <span className="text-xs text-slate-500 block">Total Inflow</span>
                <span className="text-base font-bold text-emerald-400 flex items-center">
                  <ArrowDownLeft className="w-3.5 h-3.5 mr-0.5" />
                  +${analytics?.totalCredits?.toLocaleString() || '0'}
                </span>
              </div>
              <div className="border-l border-slate-800 pl-3">
                <span className="text-xs text-slate-500 block">Total Outflow</span>
                <span className="text-base font-bold text-rose-400 flex items-center">
                  <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                  -${analytics?.totalDebits?.toLocaleString() || '0'}
                </span>
              </div>
            </div>
            <div className="mt-2.5 text-xs text-slate-400 flex justify-between">
              <span>Daily Limit:</span>
              <strong className="text-slate-200">${account.dailyLimit?.toLocaleString() || '2,500'}</strong>
            </div>
          </div>

          {/* Card 3: Recurring Subscriptions */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4.5 shadow-lg relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-medium flex items-center space-x-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Active Subscriptions</span>
              </span>
              <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded text-2xs font-bold">
                {analytics?.subscriptionsCount || 0} SERVICES
              </span>
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">
              ${analytics?.subscriptionsMonthly?.toFixed(2) || '0.00'}
              <span className="text-xs font-normal text-slate-400 ml-1">/month</span>
            </div>
            <div className="mt-3 text-xs text-slate-400 flex justify-between">
              <span>Annual Burn:</span>
              <strong className="text-amber-300 font-mono">${((analytics?.subscriptionsMonthly || 0) * 12).toFixed(2)}</strong>
            </div>
          </div>

          {/* Card 4: Security & Anomaly Shield */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4.5 shadow-lg relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-medium flex items-center space-x-1">
                <Shield className="w-3.5 h-3.5 text-indigo-400" />
                <span>Sentinel Security Health</span>
              </span>
              <span className="text-emerald-400 text-xs font-bold">ACTIVE</span>
            </div>
            <div className="flex items-center space-x-3 mt-1">
              <div>
                <span className="text-xs text-slate-500 block">High Risk Items</span>
                <span className={`text-base font-bold ${analytics?.highRiskCount > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                  {analytics?.highRiskCount || 0} Flagged
                </span>
              </div>
              <div className="border-l border-slate-800 pl-3">
                <span className="text-xs text-slate-500 block">Disputes</span>
                <span className={`text-base font-bold ${analytics?.disputedCount > 0 ? 'text-amber-400' : 'text-slate-200'}`}>
                  {analytics?.disputedCount || 0} Pending
                </span>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400">
              <span>Cedar Policy:</span>
              <span className="text-indigo-400 font-medium">100% Enforced</span>
            </div>
          </div>
        </div>
      )}

      {/* Quick Copilot Banner */}
      <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-inner">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Need AI Assistant to investigate charges or issue refunds?</div>
            <div className="text-xs text-slate-400">
              The Google Gemini Finance Bot can evaluate eligibility, assess anomalies, and draft supervised refund approvals.
            </div>
          </div>
        </div>
        <button
          onClick={() => navigate('/finance')}
          className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition shrink-0 cursor-pointer shadow-md shadow-indigo-600/20"
        >
          <span>Open AI Finance Bot</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Transaction Explorer Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-4.5 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <span>Transaction History & Security Inspection</span>
              <span className="text-xs font-normal text-slate-400">({transactions.length} total)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live ledger entries with automated risk scoring, geolocation tags, and one-click dispute workflows
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search merchant, memo, ID..."
                className="bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-52 transition"
              />
            </div>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="disputed">Disputed</option>
              <option value="pending">Pending</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="px-4.5 py-2.5 bg-slate-850/60 border-b border-slate-800/80 flex items-center gap-1.5 overflow-x-auto text-xs scrollbar-none">
          <span className="text-slate-500 text-xs font-medium mr-1 flex items-center space-x-1">
            <Filter className="w-3 h-3" />
            <span>Category:</span>
          </span>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer capitalize whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-750'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800/80">
              <tr>
                <th className="py-3 px-4">Transaction / Merchant</th>
                <th className="py-3 px-3">Category & Channel</th>
                <th className="py-3 px-3">Date & Location</th>
                <th className="py-3 px-3">Amount</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Risk Assessment</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
                    Loading transactions from ledger...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No transactions match the selected filters.
                  </td>
                </tr>
              ) : (
                transactions.map(txn => {
                  const isCredit = txn.type === 'credit';
                  const riskScore = txn.riskScore || 0;
                  const isHighRisk = riskScore >= 70;
                  const isMedRisk = riskScore >= 30 && riskScore < 70;

                  return (
                    <tr
                      key={txn.id}
                      className="hover:bg-slate-800/40 transition cursor-pointer"
                      onClick={() => setSelectedTxn(txn)}
                    >
                      {/* Merchant & Memo */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white flex items-center space-x-1.5">
                          <span>{txn.merchantName || 'Direct Transfer'}</span>
                          {txn.taintMarkers && txn.taintMarkers.length > 0 && (
                            <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 text-2xs border border-rose-500/40 font-mono">
                              FLAGGED
                            </span>
                          )}
                        </div>
                        <div className="text-slate-400 text-xs truncate max-w-xs">{txn.memo}</div>
                        <div className="text-slate-500 font-mono text-2xs mt-0.5">{txn.id}</div>
                      </td>

                      {/* Category & Channel */}
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-medium">
                          {txn.category || 'General'}
                        </span>
                        <div className="text-slate-500 capitalize text-2xs mt-1">{txn.channel || 'online'}</div>
                      </td>

                      {/* Date & Location */}
                      <td className="py-3 px-3">
                        <div className="text-slate-300">{new Date(txn.timestamp).toLocaleDateString()}</div>
                        <div className="text-slate-500 text-2xs">{txn.location || 'United States'}</div>
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-3 font-semibold font-mono text-sm">
                        <span className={isCredit ? 'text-emerald-400' : 'text-slate-200'}>
                          {isCredit ? '+' : '-'}${txn.amount.toFixed(2)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-2xs font-semibold uppercase ${
                          txn.status === 'completed' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' :
                          txn.status === 'disputed' ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30' :
                          txn.status === 'pending' ? 'bg-sky-500/10 text-sky-300 border border-sky-500/30' :
                          'bg-indigo-500/10 text-indigo-300 border border-indigo-500/30'
                        }`}>
                          {txn.status}
                        </span>
                      </td>

                      {/* Risk Score */}
                      <td className="py-3 px-3">
                        <div className="flex items-center space-x-2">
                          <div className="w-16 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full ${
                                isHighRisk ? 'bg-rose-500' : isMedRisk ? 'bg-amber-400' : 'bg-emerald-400'
                              }`}
                              style={{ width: `${Math.min(riskScore, 100)}%` }}
                            />
                          </div>
                          <span className={`font-mono text-2xs font-bold ${
                            isHighRisk ? 'text-rose-400' : isMedRisk ? 'text-amber-400' : 'text-emerald-400'
                          }`}>
                            {riskScore}/100
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => setSelectedTxn(txn)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs transition"
                            title="Inspect transaction"
                          >
                            Details
                          </button>
                          {txn.type === 'debit' && txn.status !== 'refunded' && (
                            <button
                              onClick={() => handlePrepareDispute(txn)}
                              className="px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs transition"
                              title="Dispute transaction"
                            >
                              Dispute
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Inspection Drawer / Modal */}
      {selectedTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-5 shadow-2xl relative text-left">
            <button
              onClick={() => { setSelectedTxn(null); setDisputeSuccess(null); }}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">{selectedTxn.merchantName || 'Transaction Detail'}</h3>
                <div className="text-xs text-slate-400 font-mono">{selectedTxn.id}</div>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/80 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Amount:</span>
                  <strong className="text-white font-mono text-sm">${selectedTxn.amount.toFixed(2)} {selectedTxn.currency}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Category:</span>
                  <span className="text-slate-200 font-medium">{selectedTxn.category || 'General'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Channel / Location:</span>
                  <span className="text-slate-200">{selectedTxn.channel?.toUpperCase()} • {selectedTxn.location || 'USA'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Timestamp:</span>
                  <span className="text-slate-200">{new Date(selectedTxn.timestamp).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className="text-amber-300 font-semibold uppercase">{selectedTxn.status}</span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-medium block mb-1">Transaction Description / Memo:</span>
                <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-slate-300 font-mono text-xs break-all">
                  {selectedTxn.memo}
                </div>
              </div>

              <div className="p-3 bg-indigo-950/30 rounded-lg border border-indigo-500/30 space-y-1.5">
                <div className="font-semibold text-indigo-300 flex items-center space-x-1.5">
                  <ShieldAlert className="w-4 h-4 text-indigo-400" />
                  <span>Sentinel Security Assessment</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Anomaly Risk Score:</span>
                  <span className={`font-mono font-bold ${
                    (selectedTxn.riskScore || 0) >= 70 ? 'text-rose-400' : 'text-emerald-400'
                  }`}>
                    {selectedTxn.riskScore || 0} / 100
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Cedar Policy Verification:</span>
                  <span className="text-emerald-400 font-medium">Policy Enforced via Sidecar</span>
                </div>
                {selectedTxn.taintMarkers && (
                  <div className="text-2xs text-rose-300 pt-1">
                    Taint Markers: {selectedTxn.taintMarkers.join(', ')}
                  </div>
                )}
              </div>

              {disputeSuccess && (
                <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 text-xs">
                  {disputeSuccess}
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end space-x-2.5">
              <button
                onClick={() => { setSelectedTxn(null); setDisputeSuccess(null); }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs transition"
              >
                Close
              </button>
              {selectedTxn.type === 'debit' && selectedTxn.status !== 'refunded' && (
                <button
                  onClick={() => handlePrepareDispute(selectedTxn)}
                  disabled={disputeLoading}
                  className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-medium text-xs transition shadow-md cursor-pointer flex items-center space-x-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{disputeLoading ? 'Preparing with AI...' : 'Request AI Refund Proposal'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Spending & Fraud Audit Modal */}
      {aiAuditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-indigo-500/40 rounded-xl max-w-2xl w-full p-6 shadow-2xl relative text-left max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">AI Financial & Security Audit</h3>
                  <div className="text-xs text-slate-400">Generated by Gemini via MCP Sentinel Zero-Trust Engine</div>
                </div>
              </div>
              <button
                onClick={() => setAiAuditModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 pr-2 text-xs text-slate-300 space-y-3 scrollbar-thin">
              {aiAuditLoading ? (
                <div className="py-16 text-center text-slate-400 space-y-3">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-400" />
                  <div className="font-medium text-white text-sm">Gemini is analyzing 30+ transactions...</div>
                  <div className="text-xs text-slate-500">Checking recurring subscriptions, cashflow velocity, and taint anomalies.</div>
                </div>
              ) : (
                <div className="prose prose-invert prose-xs max-w-none whitespace-pre-wrap font-sans leading-relaxed">
                  {aiAuditReport}
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setAiAuditModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AccountPortal;
