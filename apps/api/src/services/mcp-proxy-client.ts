// ============================================================
// MCP Sentinel — Backend MCP Security Proxy Client
// Intercepts, inspects, authorizes, executes, and audits
// all tool operations on behalf of the AI Finance Agent.
// ============================================================

import {
  type AuditEvent, type AuthzRequest,
  AuthzDecision, SecurityEventType, Capability,
  DEMO_IDENTITIES, generateCorrelationId, sanitizeForAudit, nowISO,
} from '@mcp-sentinel/shared';

import type { CedarPolicyEngine } from '@mcp-sentinel/policy-engine';
import type { AuditLogger } from '@mcp-sentinel/audit';
import type { IdentityProvider } from '@mcp-sentinel/identity';
import type { RequestInspector, ResponseInspector, RiskScorer, CircuitBreaker, BehavioralAnalyzer } from '@mcp-sentinel/security-core';
import { FintechLedger, sharedLedger } from '../../../demo-mcp-server/src/ledger.js';

export interface ToolExecutionResult {
  success: boolean;
  toolName: string;
  args: Record<string, unknown>;
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
  securityDecision: {
    decision: AuthzDecision;
    reason?: string;
    policyId?: string;
    correlationId: string;
    riskScore: number;
    taintMarkers?: string[];
    evaluationTimeMs?: number;
  };
}

export interface McpProxyClientOptions {
  policyEngine: CedarPolicyEngine;
  auditLogger: AuditLogger;
  identityProvider: IdentityProvider;
  requestInspector: RequestInspector;
  responseInspector: ResponseInspector;
  riskScorer: RiskScorer;
  circuitBreaker: CircuitBreaker;
  behavioralAnalyzer?: BehavioralAnalyzer;
  ledger?: FintechLedger;
  agentIdentity?: string;
  onEvent?: (event: AuditEvent) => void;
}

export class McpProxyClient {
  private policyEngine: CedarPolicyEngine;
  private auditLogger: AuditLogger;
  private identityProvider: IdentityProvider;
  private requestInspector: RequestInspector;
  private responseInspector: ResponseInspector;
  private riskScorer: RiskScorer;
  private circuitBreaker: CircuitBreaker;
  private behavioralAnalyzer?: BehavioralAnalyzer;
  private ledger: FintechLedger;
  private agentIdentity: string;
  private onEvent?: (event: AuditEvent) => void;
  private activeToken: string | null = null;
  private activeTokenId: string | null = null;
  private sessionId: string;

  constructor(options: McpProxyClientOptions) {
    this.policyEngine = options.policyEngine;
    this.auditLogger = options.auditLogger;
    this.identityProvider = options.identityProvider;
    this.requestInspector = options.requestInspector;
    this.responseInspector = options.responseInspector;
    this.riskScorer = options.riskScorer;
    this.circuitBreaker = options.circuitBreaker;
    this.behavioralAnalyzer = options.behavioralAnalyzer;
    this.ledger = options.ledger || sharedLedger;
    this.agentIdentity = options.agentIdentity || DEMO_IDENTITIES.FINANCIAL_REMEDIATION;
    this.onEvent = options.onEvent;
    this.sessionId = `session-finance-${Date.now()}`;
  }

  async initialize(): Promise<void> {
    // Ensure agent has an active EdDSA token
    const tokenResult = await this.identityProvider.issueToken({
      subject: this.agentIdentity,
      capabilities: [Capability.LEDGER_READ, Capability.CUSTOMER_READ, Capability.LEDGER_REFUND],
      authorizedResources: ['ACC-1001'],
      maxRefundAmount: 50,
      currency: 'USD',
      ttlSeconds: 86400,
    });
    this.activeToken = tokenResult.token;
    this.activeTokenId = tokenResult.claims.jti;

    // Configure Cedar entities for the principal
    this.policyEngine.setEntities([
      {
        uid: { type: 'MCPSentinel::Agent', id: this.agentIdentity },
        attrs: {
          capabilities: tokenResult.claims.capabilities,
          trustLevel: 'standard',
          maxRefundAmount: 5000, // stored as cents ($50.00)
          authorizedAccounts: tokenResult.claims.authorizedResources || ['ACC-1001'],
          currency: 'USD',
        },
        parents: [],
      },
      ...['get_account', 'list_accounts', 'get_transaction', 'get_account_transactions', 'check_refund_eligibility', 'issue_refund', 'assess_transaction_risk', 'get_refund_log'].map(name => ({
        uid: { type: 'MCPSentinel::Tool', id: name },
        attrs: {
          category: 'fintech',
          riskLevel: name === 'issue_refund' ? 'high' : 'low',
          requiredCapabilities: name === 'issue_refund' ? [Capability.LEDGER_REFUND] : [Capability.LEDGER_READ],
        },
        parents: [],
      })),
      ...['ACC-1001', 'ACC-1002', 'ACC-1003', 'ACC-1004'].map(id => ({
        uid: { type: 'MCPSentinel::Account', id },
        attrs: {
          ownerId: id,
          status: id === 'ACC-1003' ? 'suspended' : 'active',
          currency: 'USD',
        },
        parents: [],
      })),
    ]);
  }

  getLedger(): FintechLedger {
    return this.ledger;
  }

  isQuarantined(agentIdentity?: string): boolean {
    const status = this.circuitBreaker.getStatus(agentIdentity || this.agentIdentity);
    return status.state === 'QUARANTINED';
  }

  private emit(event: AuditEvent): void {
    if (this.onEvent) {
      try { this.onEvent(event); } catch { /* ignore */ }
    }
    if (this.behavioralAnalyzer) {
      try { this.behavioralAnalyzer.processEvent(event); } catch { /* ignore */ }
    }
  }

  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    overrideAgent?: string
  ): Promise<ToolExecutionResult> {
    const correlationId = generateCorrelationId();
    const startTime = performance.now();
    const agent = overrideAgent || this.agentIdentity;

    // ── 0. Check Circuit Breaker Quarantine ──
    const cbStatus = this.circuitBreaker.getStatus(agent);
    if (cbStatus.state === 'QUARANTINED') {
      const qEvent = await this.auditLogger.record({
        correlationId,
        sessionId: this.sessionId,
        agentIdentity: agent,
        toolName,
        action: 'call_tool',
        eventType: SecurityEventType.CIRCUIT_BREAKER_TRIPPED,
        decision: AuthzDecision.DENY,
        sanitizedArgs: sanitizeForAudit(args),
        outcome: 'quarantined_by_circuit_breaker',
        details: { reason: 'Agent is quarantined due to repeated security violations', cbStatus },
      });
      this.emit(qEvent);

      return {
        success: false,
        toolName,
        args,
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: 'Agent is in QUARANTINE mode. Requests blocked.', correlationId }) }],
        securityDecision: {
          decision: AuthzDecision.DENY,
          reason: 'Quarantined by autonomous circuit breaker',
          correlationId,
          riskScore: 90,
        },
      };
    }

    // ── 1. Request Inspection ──
    const inspection = this.requestInspector.inspect(toolName, args);
    if (inspection.blocked) {
      this.circuitBreaker.recordViolation(agent, inspection.blockReason || 'Request inspection blocked');
      const blockEvent = await this.auditLogger.record({
        correlationId,
        sessionId: this.sessionId,
        agentIdentity: agent,
        toolName,
        action: 'call_tool',
        eventType: SecurityEventType.TOOL_CALL_DENIED,
        decision: AuthzDecision.DENY,
        sanitizedArgs: sanitizeForAudit(args),
        outcome: 'blocked_by_inspection',
        riskAssessment: this.riskScorer.assess(inspection.findings),
        details: {
          reason: inspection.blockReason,
          findings: inspection.findings,
          evaluationTimeMs: performance.now() - startTime,
        },
      });
      this.emit(blockEvent);

      return {
        success: false,
        toolName,
        args,
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({
          error: 'Request blocked by security inspection',
          reason: inspection.blockReason,
          findings: inspection.findings,
          correlationId,
        }) }],
        securityDecision: {
          decision: AuthzDecision.DENY,
          reason: inspection.blockReason,
          correlationId,
          riskScore: 85,
        },
      };
    }

    // ── 2. Identity Verification ──
    if (this.activeToken) {
      const verifyResult = await this.identityProvider.verifyToken(this.activeToken);
      if (!verifyResult.valid) {
        this.circuitBreaker.recordViolation(agent, 'Token verification failed');
        const tokenRejectEvent = await this.auditLogger.record({
          correlationId,
          sessionId: this.sessionId,
          agentIdentity: agent,
          toolName,
          action: 'call_tool',
          eventType: SecurityEventType.TOKEN_REJECTED,
          decision: AuthzDecision.DENY,
          outcome: 'token_rejected',
          details: { reason: verifyResult.error },
        });
        this.emit(tokenRejectEvent);

        return {
          success: false,
          toolName,
          args,
          isError: true,
          content: [{ type: 'text', text: JSON.stringify({ error: 'Authorization token invalid or revoked', reason: verifyResult.error, correlationId }) }],
          securityDecision: {
            decision: AuthzDecision.DENY,
            reason: verifyResult.error,
            correlationId,
            riskScore: 75,
          },
        };
      }
    }

    // ── 3. Cedar Policy Authorization ──
    let action = 'MCPSentinel::Action::"call_tool"';
    let resource = `MCPSentinel::Tool::"${toolName}"`;
    const context: Record<string, unknown> = {
      sessionId: this.sessionId,
      tokenId: this.activeTokenId || 'none',
      isRevoked: this.activeTokenId ? this.identityProvider.isRevoked(this.activeTokenId) : false,
    };

    if (toolName === 'issue_refund') {
      action = 'MCPSentinel::Action::"issue_refund"';
      const accountId = (args.accountId as string) || '';
      resource = `MCPSentinel::Account::"${accountId || 'unknown'}"`;
      context.requestedAmount = Math.round(((args.amount as number) || 0) * 100); // cents
      context.transactionId = (args.transactionId as string) || '';
      context.currency = (args.currency as string) || 'USD';
      context.targetAccountId = accountId;
    } else if (
      toolName === 'get_account' ||
      toolName === 'get_account_transactions' ||
      toolName === 'get_transaction' ||
      toolName === 'check_refund_eligibility' ||
      toolName === 'assess_transaction_risk'
    ) {
      action = 'MCPSentinel::Action::"read_account"';
      const accountId = (args.accountId as string) || (args.targetAccountId as string);
      if (accountId) resource = `MCPSentinel::Account::"${accountId}"`;
      if (args.transactionId) context.transactionId = args.transactionId as string;
      if (accountId) context.targetAccountId = accountId;
    }

    if (args.targetAccountId) context.targetAccountId = args.targetAccountId;
    if (args.amount) context.requestedAmount = Math.round((args.amount as number) * 100);

    const authzRequest: AuthzRequest = {
      principal: `MCPSentinel::Agent::"${agent}"`,
      action,
      resource,
      context,
    };

    const authz = await this.policyEngine.evaluate(authzRequest);

    if (authz.decision !== AuthzDecision.ALLOW) {
      this.circuitBreaker.recordViolation(agent, `Cedar policy denied: ${authz.reasons.join(', ') || 'Default deny'}`);
      const denyEvent = await this.auditLogger.record({
        correlationId,
        sessionId: this.sessionId,
        agentIdentity: agent,
        toolName,
        action: toolName === 'issue_refund' ? 'issue_refund' : 'call_tool',
        resourceId: (args.accountId as string) || undefined,
        eventType: SecurityEventType.TOOL_CALL_DENIED,
        decision: AuthzDecision.DENY,
        policyId: authz.reasons[0] || 'default-deny',
        sanitizedArgs: sanitizeForAudit(args),
        outcome: 'denied_by_cedar',
        riskAssessment: this.riskScorer.assess(inspection.findings),
        details: {
          cedarDecision: authz,
          evaluationTimeMs: authz.evaluationTimeMs,
        },
      });
      this.emit(denyEvent);

      return {
        success: false,
        toolName,
        args,
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({
          error: 'Operation denied by Cedar authorization policy',
          decision: 'DENY',
          reasons: authz.reasons,
          diagnostics: authz.diagnostics,
          correlationId,
        }) }],
        securityDecision: {
          decision: AuthzDecision.DENY,
          reason: authz.reasons[0] || 'Policy denied',
          policyId: authz.reasons[0],
          correlationId,
          riskScore: 50,
          evaluationTimeMs: authz.evaluationTimeMs,
        },
      };
    }

    // ── 4. Downstream Ledger Execution ──
    let rawOutput: unknown;
    try {
      if (toolName === 'get_account') {
        rawOutput = this.ledger.getAccount(args.accountId as string);
        if (!rawOutput) rawOutput = { error: 'Account not found', accountId: args.accountId };
      } else if (toolName === 'list_accounts') {
        rawOutput = this.ledger.listAccounts();
      } else if (toolName === 'get_transaction') {
        rawOutput = this.ledger.getTransaction(args.transactionId as string, args.accountId as string | undefined);
        if (!rawOutput) rawOutput = { error: 'Transaction not found or account mismatch', transactionId: args.transactionId, accountId: args.accountId };
      } else if (toolName === 'get_account_transactions') {
        rawOutput = this.ledger.getAccountTransactions(args.accountId as string);
      } else if (toolName === 'check_refund_eligibility') {
        rawOutput = this.ledger.checkRefundEligibility(args.transactionId as string, args.accountId as string | undefined);
      } else if (toolName === 'assess_transaction_risk') {
        const txn = this.ledger.getTransaction(args.transactionId as string, args.accountId as string | undefined);
        if (!txn) {
          rawOutput = { error: 'Transaction not found or account mismatch' };
        } else {
          const assessment = {
            transactionId: txn.id,
            accountId: txn.accountId,
            amount: txn.amount,
            riskScore: txn.riskScore ?? 0,
            riskLevel: (txn.riskScore ?? 0) >= 80 ? 'HIGH' : (txn.riskScore ?? 0) >= 40 ? 'MEDIUM' : 'LOW',
            factors: [] as string[],
          };
          if ((txn.riskScore ?? 0) >= 80) assessment.factors.push('Suspicious merchant', 'Unusual memo content');
          if (txn.status === 'disputed') assessment.factors.push('Customer dispute filed');
          if (txn.amount > 100) assessment.factors.push('High value transaction');
          rawOutput = assessment;
        }
      } else if (toolName === 'issue_refund') {
        rawOutput = this.ledger.executeRefund({
          transactionId: args.transactionId as string,
          accountId: args.accountId as string,
          amount: args.amount as number,
          currency: (args.currency as string) || 'USD',
          reason: (args.reason as string) || 'Authorized customer refund',
        });
      } else if (toolName === 'get_refund_log') {
        rawOutput = this.ledger.getRefundLog();
      } else {
        rawOutput = { error: `Tool ${toolName} not supported in ledger` };
      }
    } catch (execErr: any) {
      rawOutput = { error: execErr.message || 'Ledger execution failed' };
    }

    const outputText = typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput, null, 2);

    // ── 5. Response Inspection ──
    const responseInspection = this.responseInspector.inspect(outputText);
    if (responseInspection.findings.length > 0) {
      for (const finding of responseInspection.findings) {
        const findingType = finding.type === 'PROMPT_INJECTION_DETECTED'
          ? SecurityEventType.PROMPT_INJECTION_DETECTED
          : finding.type === 'SECRET_DETECTED'
            ? SecurityEventType.SECRET_DETECTED
            : SecurityEventType.RESPONSE_SCHEMA_VIOLATION;

        const findingEvent = await this.auditLogger.record({
          correlationId,
          sessionId: this.sessionId,
          agentIdentity: agent,
          toolName,
          action: 'response_inspection',
          eventType: findingType,
          details: { finding: finding.type, description: finding.description, evidence: finding.evidence },
        });
        this.emit(findingEvent);
      }
    }

    // Apply redactions if secrets were detected
    const finalText = responseInspection.redactedContent ? String(responseInspection.redactedContent) : outputText;

    // ── 6. Record Success Audit Event ──
    const totalTimeMs = performance.now() - startTime;
    const allowEvent = await this.auditLogger.record({
      correlationId,
      sessionId: this.sessionId,
      agentIdentity: agent,
      toolName,
      action: toolName === 'issue_refund' ? 'issue_refund' : 'call_tool',
      resourceId: (args.accountId as string) || undefined,
      eventType: SecurityEventType.TOOL_CALL_ALLOWED,
      decision: AuthzDecision.ALLOW,
      policyId: authz.reasons[0] || 'fin-remediation-allowed-tools',
      sanitizedArgs: sanitizeForAudit(args),
      outcome: 'success',
      riskAssessment: this.riskScorer.assess([...inspection.findings, ...responseInspection.findings]),
      details: {
        cedarDecision: authz,
        responseFindings: responseInspection.findings.length,
        taintMarkers: responseInspection.taintMarkers,
        evaluationTimeMs: authz.evaluationTimeMs,
        totalTimeMs,
      },
    });
    this.emit(allowEvent);

    return {
      success: true,
      toolName,
      args,
      content: [{ type: 'text', text: finalText }],
      securityDecision: {
        decision: AuthzDecision.ALLOW,
        policyId: authz.reasons[0],
        correlationId,
        riskScore: responseInspection.taintMarkers.length > 0 ? 60 : 10,
        taintMarkers: responseInspection.taintMarkers,
        evaluationTimeMs: totalTimeMs,
      },
    };
  }
}
