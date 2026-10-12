// ============================================================
// MCP Sentinel — MCP Security Proxy
// stdio-to-stdio proxy that intercepts, inspects, authorizes,
// and audits every tool invocation
// ============================================================

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolve, join } from 'node:path';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { z } from 'zod';

import {
  type AuthzRequest, type AuditEvent, type InspectionFinding,
  AuthzDecision, SecurityEventType, Capability, RiskLevel,
  generateCorrelationId, sanitizeForAudit, nowISO,
  DEMO_IDENTITIES, PROXY_CONFIG,
} from '@mcp-sentinel/shared';

import { CedarPolicyEngine } from '@mcp-sentinel/policy-engine';
import { AuditLogger } from '@mcp-sentinel/audit';
import { IdentityProvider } from '@mcp-sentinel/identity';
import { RequestInspector, ResponseInspector, RiskScorer, BehavioralAnalyzer } from '@mcp-sentinel/security-core';

// ── Configuration ─────────────────────────────────────────────
const PROJECT_ROOT = resolve(import.meta.dirname || process.cwd(), '..', '..', '..');
const POLICY_DIR = join(PROJECT_ROOT, 'policies');
const DATA_DIR = join(PROJECT_ROOT, 'data');
const DB_PATH = join(DATA_DIR, 'sentinel.db');
const EVENT_FILE = join(DATA_DIR, 'events.jsonl');

// Downstream server command
const DOWNSTREAM_CMD = process.env.DOWNSTREAM_CMD || 'npx';
const DOWNSTREAM_ARGS = (process.env.DOWNSTREAM_ARGS || `tsx,${join(PROJECT_ROOT, 'apps', 'demo-mcp-server', 'src', 'index.ts')}`).split(',');

// Active agent identity for this session
const AGENT_IDENTITY = process.env.AGENT_IDENTITY || DEMO_IDENTITIES.FINANCIAL_REMEDIATION;
const SESSION_ID = `session-${Date.now()}`;

// ── Tool categorization for Cedar ─────────────────────────────
const TOOL_CATEGORIES: Record<string, string> = {
  get_account: 'fintech',
  list_accounts: 'fintech',
  get_transaction: 'fintech',
  get_account_transactions: 'fintech',
  check_refund_eligibility: 'fintech',
  issue_refund: 'fintech',
  assess_transaction_risk: 'fintech',
  get_refund_log: 'fintech',
  reset_ledger: 'admin',
};

const TOOL_CAPABILITIES: Record<string, Capability[]> = {
  get_account: [Capability.LEDGER_READ, Capability.CUSTOMER_READ],
  list_accounts: [Capability.LEDGER_READ, Capability.CUSTOMER_READ],
  get_transaction: [Capability.LEDGER_READ],
  get_account_transactions: [Capability.LEDGER_READ],
  check_refund_eligibility: [Capability.LEDGER_READ],
  issue_refund: [Capability.LEDGER_REFUND],
  assess_transaction_risk: [Capability.LEDGER_READ],
  get_refund_log: [Capability.LEDGER_READ],
  reset_ledger: [Capability.LEDGER_REFUND],
};

// ── Initialize components ─────────────────────────────────────
const policyEngine = new CedarPolicyEngine({ policyDir: POLICY_DIR });
const auditLogger = new AuditLogger(DB_PATH);
const identityProvider = new IdentityProvider();
const requestInspector = new RequestInspector();
const responseInspector = new ResponseInspector();
const riskScorer = new RiskScorer();
const behavioralAnalyzer = new BehavioralAnalyzer();

// Current active token
let activeToken: string | null = null;
let activeTokenId: string | null = null;

/**
 * Write an event to the shared event file for the API server to read.
 */
function emitEvent(event: AuditEvent): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(EVENT_FILE, JSON.stringify(event) + '\n', { flag: 'a' });
  } catch {
    // Non-fatal
  }
}

/**
 * Build Cedar entities for authorization.
 */
function buildCedarEntities(agentIdentity: string, capabilities: Capability[], authorizedAccounts: string[]): unknown[] {
  return [
    {
      uid: { type: 'MCPSentinel::Agent', id: agentIdentity },
      attrs: {
        capabilities: capabilities,
        trustLevel: 'standard',
        maxRefundAmount: 5000, // stored as cents
        authorizedAccounts: authorizedAccounts,
        currency: 'USD',
      },
      parents: [],
    },
    // Tool entities
    ...Object.entries(TOOL_CATEGORIES).map(([name, category]) => ({
      uid: { type: 'MCPSentinel::Tool', id: name },
      attrs: {
        category,
        riskLevel: name === 'issue_refund' ? 'high' : 'low',
        requiredCapabilities: TOOL_CAPABILITIES[name] || [],
      },
      parents: [],
    })),
    // Account entities
    ...['ACC-1001', 'ACC-1002', 'ACC-1003', 'ACC-1004'].map(id => ({
      uid: { type: 'MCPSentinel::Account', id },
      attrs: {
        ownerId: id,
        status: id === 'ACC-1003' ? 'suspended' : 'active',
        currency: 'USD',
      },
      parents: [],
    })),
  ];
}

/**
 * Authorize a tool call through the Cedar policy engine.
 */
async function authorizeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  agentIdentity: string,
  correlationId: string,
): Promise<{ allowed: boolean; result: import('@mcp-sentinel/shared').AuthzResult; policyId?: string }> {
  // Determine action based on tool
  let action = 'MCPSentinel::Action::"call_tool"';
  let resource = `MCPSentinel::Tool::"${toolName}"`;

  // Build context
  const context: Record<string, unknown> = {
    sessionId: SESSION_ID,
    tokenId: activeTokenId || 'none',
    isRevoked: activeTokenId ? identityProvider.isRevoked(activeTokenId) : false,
  };

  if (toolName === 'issue_refund') {
    action = 'MCPSentinel::Action::"issue_refund"';
    const accountId = args.accountId as string;
    resource = `MCPSentinel::Account::"${accountId || 'unknown'}"`;
    context.requestedAmount = Math.round((args.amount as number || 0) * 100); // cents
    context.transactionId = (args.transactionId as string) || '';
    context.currency = (args.currency as string) || 'USD';
    context.targetAccountId = accountId;
  } else if (toolName === 'get_account' || toolName === 'get_account_transactions') {
    action = 'MCPSentinel::Action::"read_account"';
    const accountId = args.accountId as string;
    if (accountId) resource = `MCPSentinel::Account::"${accountId}"`;
  }

  if (args.targetAccountId) context.targetAccountId = args.targetAccountId;
  if (args.amount) context.requestedAmount = Math.round((args.amount as number) * 100);

  const authzRequest: AuthzRequest = {
    principal: `MCPSentinel::Agent::"${agentIdentity}"`,
    action,
    resource,
    context,
  };

  const result = await policyEngine.evaluate(authzRequest);

  return {
    allowed: result.decision === AuthzDecision.ALLOW,
    result,
    policyId: result.reasons.length > 0 ? result.reasons[0] : undefined,
  };
}

// ── Main proxy logic ──────────────────────────────────────────
async function main() {
  const log = (msg: string) => console.error(`[mcp-proxy] ${msg}`);

  log('Initializing MCP Security Proxy...');

  // Initialize all components
  await auditLogger.initialize();
  log('Audit logger initialized');

  await identityProvider.initialize();
  log('Identity provider initialized');

  await policyEngine.initialize();
  log('Cedar policy engine initialized');

  // Issue default demo token
  const tokenResult = await identityProvider.issueToken({
    subject: AGENT_IDENTITY,
    capabilities: [Capability.LEDGER_READ, Capability.CUSTOMER_READ, Capability.LEDGER_REFUND],
    authorizedResources: ['ACC-1001'],
    maxRefundAmount: 50,
    currency: 'USD',
    ttlSeconds: 3600,
  });
  activeToken = tokenResult.token;
  activeTokenId = tokenResult.claims.jti;
  log(`Demo token issued: ${activeTokenId}`);

  // Set Cedar entities
  policyEngine.setEntities(buildCedarEntities(
    AGENT_IDENTITY,
    tokenResult.claims.capabilities,
    tokenResult.claims.authorizedResources || ['ACC-1001'],
  ));

  // Connect to downstream MCP server
  log(`Connecting to downstream: ${DOWNSTREAM_CMD} ${DOWNSTREAM_ARGS.join(' ')}`);
  const downstreamTransport = new StdioClientTransport({
    command: DOWNSTREAM_CMD,
    args: DOWNSTREAM_ARGS,
  });

  const downstreamClient = new Client({
    name: 'sentinel-proxy',
    version: '1.0.0',
  });

  await downstreamClient.connect(downstreamTransport);
  log('Connected to downstream MCP server');

  // Discover downstream tools
  const toolsResult = await downstreamClient.listTools();
  const discoveredTools = toolsResult.tools;
  log(`Discovered ${discoveredTools.length} tools: ${discoveredTools.map(t => t.name).join(', ')}`);

  // Record discovery event
  const discoveryEvent = await auditLogger.record({
    correlationId: generateCorrelationId(),
    sessionId: SESSION_ID,
    agentIdentity: AGENT_IDENTITY,
    toolName: '*',
    action: 'discovery',
    eventType: SecurityEventType.TOOL_DISCOVERY,
    details: { tools: discoveredTools.map(t => t.name) },
  });
  emitEvent(discoveryEvent);

  // Set allowed tools based on discovery + policy
  const allowedToolNames = discoveredTools.map(t => t.name).filter(name => TOOL_CATEGORIES[name] !== undefined);
  requestInspector.setAllowedTools(allowedToolNames);

  // Create upstream proxy server
  const proxyServer = new McpServer({
    name: 'mcp-sentinel-proxy',
    version: '1.0.0',
  });

  // Register each discovered tool as a proxied tool
  for (const tool of discoveredTools) {
    if (!TOOL_CATEGORIES[tool.name]) {
      log(`Skipping unregistered tool: ${tool.name}`);
      continue;
    }

    // Build Zod schema from the tool's input schema
    const schemaProps: Record<string, z.ZodTypeAny> = {};
    if (tool.inputSchema && typeof tool.inputSchema === 'object' && 'properties' in tool.inputSchema) {
      const props = tool.inputSchema.properties as Record<string, { type?: string; description?: string }>;
      for (const [key, val] of Object.entries(props)) {
        if (val.type === 'number') {
          schemaProps[key] = z.number().describe(val.description || key);
        } else {
          schemaProps[key] = z.string().describe(val.description || key);
        }
      }
    }

    const toolName = tool.name;
    const toolDescription = `[Proxied] ${tool.description || toolName}`;

    proxyServer.tool(
      toolName,
      toolDescription,
      schemaProps,
      async (args: Record<string, unknown>) => {
        const correlationId = generateCorrelationId();
        const startTime = performance.now();
        log(`[${correlationId}] Tool call: ${toolName}`);

        try {
          // ── Step 1: Request inspection ──
          const inspection = requestInspector.inspect(toolName, args as Record<string, unknown>);
          if (inspection.blocked) {
            const blockEvent = await auditLogger.record({
              correlationId,
              sessionId: SESSION_ID,
              agentIdentity: AGENT_IDENTITY,
              toolName,
              action: 'call_tool',
              eventType: SecurityEventType.TOOL_CALL_DENIED,
              decision: AuthzDecision.DENY,
              sanitizedArgs: sanitizeForAudit(args as Record<string, unknown>),
              outcome: 'blocked_by_inspection',
              riskAssessment: riskScorer.assess(inspection.findings),
              details: {
                reason: inspection.blockReason,
                findings: inspection.findings,
                evaluationTimeMs: performance.now() - startTime,
              },
            });
            emitEvent(blockEvent);
            behavioralAnalyzer.processEvent(blockEvent);

            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: 'Request blocked by security inspection',
                reason: inspection.blockReason,
                correlationId,
              }) }],
              isError: true,
            };
          }

          // ── Step 2: Token verification ──
          if (activeToken) {
            const verifyResult = await identityProvider.verifyToken(activeToken);
            if (!verifyResult.valid) {
              const rejectEvent = await auditLogger.record({
                correlationId,
                sessionId: SESSION_ID,
                agentIdentity: AGENT_IDENTITY,
                toolName,
                action: 'call_tool',
                eventType: SecurityEventType.TOKEN_REJECTED,
                decision: AuthzDecision.DENY,
                outcome: 'token_rejected',
                details: { reason: verifyResult.error, evaluationTimeMs: performance.now() - startTime },
              });
              emitEvent(rejectEvent);
              behavioralAnalyzer.processEvent(rejectEvent);

              return {
                content: [{ type: 'text' as const, text: JSON.stringify({
                  error: 'Authorization token invalid or revoked',
                  reason: verifyResult.error,
                  correlationId,
                }) }],
                isError: true,
              };
            }
          }

          // ── Step 3: Cedar authorization ──
          const authz = await authorizeToolCall(toolName, args as Record<string, unknown>, AGENT_IDENTITY, correlationId);

          if (!authz.allowed) {
            const denyEvent = await auditLogger.record({
              correlationId,
              sessionId: SESSION_ID,
              agentIdentity: AGENT_IDENTITY,
              toolName,
              action: toolName === 'issue_refund' ? 'issue_refund' : 'call_tool',
              resourceId: (args as Record<string, unknown>).accountId as string || undefined,
              eventType: SecurityEventType.TOOL_CALL_DENIED,
              decision: AuthzDecision.DENY,
              policyId: authz.policyId,
              sanitizedArgs: sanitizeForAudit(args as Record<string, unknown>),
              outcome: 'denied_by_cedar',
              riskAssessment: riskScorer.assess(inspection.findings),
              details: {
                cedarDecision: authz.result,
                evaluationTimeMs: authz.result.evaluationTimeMs,
              },
            });
            emitEvent(denyEvent);
            behavioralAnalyzer.processEvent(denyEvent);

            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: 'Operation denied by authorization policy',
                decision: 'DENY',
                reasons: authz.result.reasons,
                diagnostics: authz.result.diagnostics,
                correlationId,
              }) }],
              isError: true,
            };
          }

          // ── Step 4: Forward to downstream ──
          log(`[${correlationId}] Forwarding to downstream: ${toolName}`);
          const downstreamResult = await downstreamClient.callTool({
            name: toolName,
            arguments: args as Record<string, unknown>,
          });

          // ── Step 5: Response inspection ──
          const responseText = (downstreamResult.content as Array<{type: string; text: string}>)?.[0]?.text || '';
          const responseInspection = responseInspector.inspect(responseText);

          // Record response findings
          if (responseInspection.findings.length > 0) {
            for (const finding of responseInspection.findings) {
              const findingType = finding.type === 'PROMPT_INJECTION_DETECTED'
                ? SecurityEventType.PROMPT_INJECTION_DETECTED
                : finding.type === 'SECRET_DETECTED'
                  ? SecurityEventType.SECRET_DETECTED
                  : SecurityEventType.RESPONSE_SCHEMA_VIOLATION;

              const findingEvent = await auditLogger.record({
                correlationId,
                sessionId: SESSION_ID,
                agentIdentity: AGENT_IDENTITY,
                toolName,
                action: 'response_inspection',
                eventType: findingType,
                details: { finding: finding.type, description: finding.description, evidence: finding.evidence },
              });
              emitEvent(findingEvent);
              behavioralAnalyzer.processEvent(findingEvent);
            }
          }

          // Apply redaction if secrets were found
          let finalContent = downstreamResult.content;
          if (responseInspection.redactedContent && typeof responseInspection.redactedContent === 'string') {
            finalContent = [{ type: 'text' as const, text: responseInspection.redactedContent }];
          }

          // ── Step 6: Record success ──
          const totalTime = performance.now() - startTime;
          const allowEvent = await auditLogger.record({
            correlationId,
            sessionId: SESSION_ID,
            agentIdentity: AGENT_IDENTITY,
            toolName,
            action: toolName === 'issue_refund' ? 'issue_refund' : 'call_tool',
            resourceId: (args as Record<string, unknown>).accountId as string || undefined,
            eventType: SecurityEventType.TOOL_CALL_ALLOWED,
            decision: AuthzDecision.ALLOW,
            policyId: authz.policyId,
            sanitizedArgs: sanitizeForAudit(args as Record<string, unknown>),
            outcome: 'success',
            riskAssessment: riskScorer.assess([...inspection.findings, ...responseInspection.findings]),
            details: {
              cedarDecision: authz.result,
              responseFindings: responseInspection.findings.length,
              taintMarkers: responseInspection.taintMarkers,
              evaluationTimeMs: authz.result.evaluationTimeMs,
              totalTimeMs: totalTime,
            },
          });
          emitEvent(allowEvent);
          behavioralAnalyzer.processEvent(allowEvent);

          // Add taint markers if present
          if (responseInspection.taintMarkers.length > 0) {
            const taintWarning = `\n\n⚠️ SECURITY NOTICE: Content marked with: ${responseInspection.taintMarkers.join(', ')}`;
            if (Array.isArray(finalContent) && finalContent.length > 0) {
              const first = finalContent[0] as { type: string; text: string };
              finalContent = [{ type: 'text' as const, text: first.text + taintWarning }];
            }
          }

          return { content: finalContent as Array<{type: 'text'; text: string}> };

        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          log(`[${correlationId}] Error: ${errorMsg}`);

          const errorEvent = await auditLogger.record({
            correlationId,
            sessionId: SESSION_ID,
            agentIdentity: AGENT_IDENTITY,
            toolName,
            action: 'call_tool',
            eventType: SecurityEventType.TOOL_CALL_DENIED,
            decision: AuthzDecision.DENY,
            outcome: 'error',
            details: { error: errorMsg, evaluationTimeMs: performance.now() - startTime },
          });
          emitEvent(errorEvent);

          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              error: 'Tool execution failed',
              message: errorMsg,
              correlationId,
            }) }],
            isError: true,
          };
        }
      }
    );
  }

  // Start the proxy server on stdio
  const upstreamTransport = new StdioServerTransport();
  await proxyServer.connect(upstreamTransport);
  log('MCP Security Proxy started — listening on stdio');
}

main().catch((err) => {
  console.error('[mcp-proxy] Fatal error:', err);
  process.exit(1);
});
