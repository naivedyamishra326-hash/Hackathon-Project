// ============================================================
// MCP Sentinel — Demo MCP Server
// Fintech tools exposed via official MCP SDK (stdio transport)
// ============================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { FintechLedger } from './ledger.js';

const ledger = new FintechLedger();

const server = new McpServer({
  name: 'sentinel-fintech-demo',
  version: '1.0.0',
});

// ── Tool: get_account ─────────────────────────────────────────
server.tool(
  'get_account',
  'Look up a customer account by ID',
  { accountId: z.string().describe('Customer account ID (e.g. ACC-1001)') },
  async ({ accountId }) => {
    const account = ledger.getAccount(accountId);
    if (!account) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Account not found', accountId }) }],
      };
    }
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(account, null, 2) }],
    };
  }
);

// ── Tool: list_accounts ───────────────────────────────────────
server.tool(
  'list_accounts',
  'List all customer accounts',
  {},
  async () => {
    const accounts = ledger.listAccounts();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(accounts, null, 2) }],
    };
  }
);

// ── Tool: get_transaction ─────────────────────────────────────
server.tool(
  'get_transaction',
  'Get transaction details by ID',
  { transactionId: z.string().describe('Transaction ID (e.g. TXN-2001)') },
  async ({ transactionId }) => {
    const txn = ledger.getTransaction(transactionId);
    if (!txn) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Transaction not found', transactionId }) }],
      };
    }
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(txn, null, 2) }],
    };
  }
);

// ── Tool: get_account_transactions ────────────────────────────
server.tool(
  'get_account_transactions',
  'Get all transactions for a customer account',
  { accountId: z.string().describe('Customer account ID') },
  async ({ accountId }) => {
    const txns = ledger.getAccountTransactions(accountId);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(txns, null, 2) }],
    };
  }
);

// ── Tool: check_refund_eligibility ────────────────────────────
server.tool(
  'check_refund_eligibility',
  'Check if a transaction is eligible for refund',
  { transactionId: z.string().describe('Transaction ID to check') },
  async ({ transactionId }) => {
    const result = ledger.checkRefundEligibility(transactionId);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool: issue_refund ────────────────────────────────────────
server.tool(
  'issue_refund',
  'Issue a refund for a transaction. Requires authorization.',
  {
    transactionId: z.string().describe('Transaction ID to refund'),
    accountId: z.string().describe('Account ID for the refund'),
    amount: z.number().positive().describe('Refund amount in dollars'),
    currency: z.string().default('USD').describe('Currency code'),
    reason: z.string().describe('Reason for the refund'),
  },
  async ({ transactionId, accountId, amount, currency, reason }) => {
    // NOTE: Authorization is enforced by the MCP proxy BEFORE this executes.
    // If this code runs, the proxy has already allowed it.
    const result = ledger.executeRefund({
      transactionId,
      accountId,
      amount,
      currency,
      reason,
    });
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Tool: assess_transaction_risk ─────────────────────────────
server.tool(
  'assess_transaction_risk',
  'Assess the risk level of a transaction',
  { transactionId: z.string().describe('Transaction ID to assess') },
  async ({ transactionId }) => {
    const txn = ledger.getTransaction(transactionId);
    if (!txn) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Transaction not found' }) }],
      };
    }
    const assessment = {
      transactionId,
      riskScore: txn.riskScore ?? 0,
      riskLevel: (txn.riskScore ?? 0) >= 80 ? 'HIGH' : (txn.riskScore ?? 0) >= 40 ? 'MEDIUM' : 'LOW',
      factors: [] as string[],
    };
    if ((txn.riskScore ?? 0) >= 80) assessment.factors.push('Suspicious merchant', 'Unusual memo content');
    if (txn.status === 'disputed') assessment.factors.push('Customer dispute filed');
    if (txn.amount > 100) assessment.factors.push('High value transaction');
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(assessment, null, 2) }],
    };
  }
);

// ── Tool: get_refund_log ──────────────────────────────────────
server.tool(
  'get_refund_log',
  'Get the complete refund execution log (for verification)',
  {},
  async () => {
    const log = ledger.getRefundLog();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(log, null, 2) }],
    };
  }
);

// ── Tool: reset_ledger ────────────────────────────────────────
server.tool(
  'reset_ledger',
  'Reset the fintech ledger to its initial state (demo reset)',
  {},
  async () => {
    ledger.reset();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ success: true, message: 'Ledger reset to initial state' }) }],
    };
  }
);

// ── Start Server ──────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr to avoid corrupting stdio protocol traffic
  console.error('[demo-mcp-server] Fintech demo server started on stdio');
}

main().catch((err) => {
  console.error('[demo-mcp-server] Fatal error:', err);
  process.exit(1);
});
