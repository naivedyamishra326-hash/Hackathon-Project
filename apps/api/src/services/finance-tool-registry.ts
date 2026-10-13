// ============================================================
// MCP Sentinel — Finance Tool Registry for Gemini Function Calling
// Defines approved model-facing tool declarations and strictly routes
// function calls through the MCP Sentinel security proxy.
// ============================================================

import { z } from 'zod';
import type { McpProxyClient, ToolExecutionResult } from './mcp-proxy-client.js';
import type { RefundConfirmationService, PendingRefund } from './refund-confirmation-service.js';

export interface FinanceToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

export interface ToolRouteResult {
  toolName: string;
  args: Record<string, unknown>;
  output: Record<string, unknown> | string;
  isError?: boolean;
  pendingRefund?: PendingRefund;
  securityDecision?: ToolExecutionResult['securityDecision'];
}

export class FinanceToolRegistry {
  private mcpClient: McpProxyClient;
  private refundService: RefundConfirmationService;

  // Explicit model-facing tool allowlist
  private readonly approvedTools = new Set([
    'get_account',
    'get_transaction',
    'get_account_transactions',
    'check_refund_eligibility',
    'assess_transaction_risk',
    'request_refund_confirmation',
  ]);

  constructor(mcpClient: McpProxyClient, refundService: RefundConfirmationService) {
    this.mcpClient = mcpClient;
    this.refundService = refundService;
  }

  /**
   * Returns Gemini-compatible Function Declarations for the model prompt.
   */
  getGeminiFunctionDeclarations(): FinanceToolDeclaration[] {
    return [
      {
        name: 'get_account',
        description: 'Look up account balance, owner details, status, and currency for a customer account (e.g. ACC-1001).',
        parameters: {
          type: 'OBJECT',
          properties: {
            accountId: {
              type: 'STRING',
              description: 'Customer account ID (e.g. ACC-1001, ACC-1002).',
            },
          },
          required: ['accountId'],
        },
      },
      {
        name: 'get_transaction',
        description: 'Look up detailed information for a specific transaction including amount, timestamp, status, merchant, and memo.',
        parameters: {
          type: 'OBJECT',
          properties: {
            transactionId: {
              type: 'STRING',
              description: 'Transaction ID to retrieve (e.g. TXN-2001, TXN-2002).',
            },
            accountId: {
              type: 'STRING',
              description: 'Associated customer account ID to verify resource ownership (e.g. ACC-1001).',
            },
          },
          required: ['transactionId'],
        },
      },
      {
        name: 'get_account_transactions',
        description: 'List all recent transactions associated with a customer account.',
        parameters: {
          type: 'OBJECT',
          properties: {
            accountId: {
              type: 'STRING',
              description: 'Account ID to fetch transactions for (e.g. ACC-1001).',
            },
          },
          required: ['accountId'],
        },
      },
      {
        name: 'check_refund_eligibility',
        description: 'Check whether a specific transaction is eligible for refund based on payment status, age, and existing refunds.',
        parameters: {
          type: 'OBJECT',
          properties: {
            transactionId: {
              type: 'STRING',
              description: 'Transaction ID to evaluate for refund eligibility (e.g. TXN-2002).',
            },
            accountId: {
              type: 'STRING',
              description: 'Customer account ID for resource isolation verification.',
            },
          },
          required: ['transactionId'],
        },
      },
      {
        name: 'assess_transaction_risk',
        description: 'Assess suspicious activity or fraud risk score for a transaction, analyzing merchant factors and transaction memo.',
        parameters: {
          type: 'OBJECT',
          properties: {
            transactionId: {
              type: 'STRING',
              description: 'Transaction ID to assess for risk (e.g. TXN-2002, TXN-2005).',
            },
            accountId: {
              type: 'STRING',
              description: 'Customer account ID for verification.',
            },
          },
          required: ['transactionId'],
        },
      },
      {
        name: 'request_refund_confirmation',
        description: 'Prepare a proposed customer refund for human supervisor review. Does NOT execute the refund immediately; creates a pending confirmation card for user approval.',
        parameters: {
          type: 'OBJECT',
          properties: {
            transactionId: {
              type: 'STRING',
              description: 'The transaction ID to refund (e.g. TXN-2002).',
            },
            accountId: {
              type: 'STRING',
              description: 'Customer account ID receiving the refund (e.g. ACC-1001).',
            },
            amount: {
              type: 'NUMBER',
              description: 'Amount in dollars to refund (e.g. 29.50).',
            },
            currency: {
              type: 'STRING',
              description: 'Currency code, defaults to USD.',
            },
            reason: {
              type: 'STRING',
              description: 'Legitimate explanation for the refund request.',
            },
          },
          required: ['transactionId', 'accountId', 'amount', 'reason'],
        },
      },
    ];
  }

  /**
   * Validate function name and arguments, then execute via MCP Sentinel or Refund Confirmation.
   */
  async routeFunctionCall(
    functionName: string,
    args: Record<string, unknown>,
    sessionId?: string
  ): Promise<ToolRouteResult> {
    // 1. Check Allowlist
    if (!this.approvedTools.has(functionName)) {
      // Intercept accidental or adversarial issue_refund calls:
      if (functionName === 'issue_refund') {
        // Divert to request_refund_confirmation safely
        return this.handleRefundConfirmation(args, sessionId);
      }

      return {
        toolName: functionName,
        args,
        isError: true,
        output: {
          error: `Function '${functionName}' is not permitted or does not exist in the approved tool allowlist.`,
        },
      };
    }

    // 2. Handle Application-Managed Refund Confirmation
    if (functionName === 'request_refund_confirmation') {
      return this.handleRefundConfirmation(args, sessionId);
    }

    // 3. For Read-Only tools, route through MCP Proxy Client
    const execution = await this.mcpClient.executeTool(functionName, args);

    let parsedOutput: Record<string, unknown> | string;
    try {
      const text = execution.content[0]?.text || '{}';
      parsedOutput = JSON.parse(text);
    } catch {
      parsedOutput = execution.content[0]?.text || '';
    }

    return {
      toolName: functionName,
      args,
      output: parsedOutput,
      isError: execution.isError,
      securityDecision: execution.securityDecision,
    };
  }

  /**
   * Process refund preparation by first checking eligibility via proxy,
   * then storing a pending confirmation card without modifying the ledger.
   */
  private async handleRefundConfirmation(
    args: Record<string, unknown>,
    sessionId?: string
  ): Promise<ToolRouteResult> {
    const transactionId = String(args.transactionId || '');
    const accountId = String(args.accountId || 'ACC-1001');
    const amount = Number(args.amount || 0);
    const currency = String(args.currency || 'USD');
    const reason = String(args.reason || 'Requested customer refund');

    if (!transactionId || amount <= 0) {
      return {
        toolName: 'request_refund_confirmation',
        args,
        isError: true,
        output: {
          error: 'Invalid refund parameters: transactionId and positive amount are required.',
        },
      };
    }

    // STEP 3 & 4: Check refund eligibility through the MCP Sentinel security proxy
    const eligibilityCheck = await this.mcpClient.executeTool('check_refund_eligibility', {
      transactionId,
      accountId,
    });

    let eligibility: { eligible: boolean; reason: string; maxRefundAmount?: number } = {
      eligible: false,
      reason: 'Could not determine eligibility',
    };

    try {
      eligibility = JSON.parse(eligibilityCheck.content[0]?.text || '{}');
    } catch { /* ignore */ }

    if (!eligibility.eligible) {
      return {
        toolName: 'request_refund_confirmation',
        args,
        isError: true,
        output: {
          status: 'REFUND_NOT_ELIGIBLE',
          message: `Transaction ${transactionId} is not eligible for refund: ${eligibility.reason}`,
        },
        securityDecision: eligibilityCheck.securityDecision,
      };
    }

    // STEP 5: Create pending refund in trusted server-side state
    const pendingRefund = this.refundService.createPendingRefund({
      transactionId,
      accountId,
      amount,
      currency,
      reason,
      sessionId,
    });

    return {
      toolName: 'request_refund_confirmation',
      args,
      pendingRefund,
      output: {
        status: 'CONFIRMATION_REQUIRED',
        confirmationId: pendingRefund.confirmationId,
        transactionId,
        accountId,
        amount,
        currency,
        reason,
        expiresAt: pendingRefund.expiresAt,
        message: `Refund of ${amount} ${currency} prepared for ${transactionId}. A confirmation card has been issued to the user for explicit approval before ledger execution.`,
      },
      securityDecision: eligibilityCheck.securityDecision,
    };
  }
}
