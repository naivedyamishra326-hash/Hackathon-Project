// ============================================================
// MCP Sentinel — Performance & Latency Benchmark
// Measures authorization, inspection, and hashing overhead
// ============================================================

import { resolve } from 'node:path';
import { CedarPolicyEngine } from '@mcp-sentinel/policy-engine';
import { AuditLogger } from '@mcp-sentinel/audit';
import { IdentityProvider } from '@mcp-sentinel/identity';
import { RequestInspector, ResponseInspector } from '@mcp-sentinel/security-core';
import {
  Capability,
  DEMO_IDENTITIES,
  generateCorrelationId,
  AuthzDecision,
  SecurityEventType,
} from '@mcp-sentinel/shared';

function calculateStats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p90 = sorted[Math.floor(sorted.length * 0.90)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  return { avg, p50, p90, p95, p99, min, max, count: sorted.length };
}

function formatRow(name: string, stats: ReturnType<typeof calculateStats>) {
  console.log(
    `| ${name.padEnd(30)} | ${stats.avg.toFixed(3).padStart(8)} ms | ${stats.p50.toFixed(3).padStart(8)} ms | ${stats.p95.toFixed(3).padStart(8)} ms | ${stats.p99.toFixed(3).padStart(8)} ms |`
  );
}

async function main() {
  console.log('============================================================');
  console.log('  MCP Sentinel — Zero-Trust Security Overhead Benchmark');
  console.log('============================================================\n');

  const POLICY_DIR = resolve(process.cwd(), 'policies');
  const DB_PATH = resolve(process.cwd(), 'data/benchmark.db');

  const policyEngine = new CedarPolicyEngine({ policyDir: POLICY_DIR });
  await policyEngine.initialize();

  const identityProvider = new IdentityProvider();
  await identityProvider.initialize();

  const auditLogger = new AuditLogger(DB_PATH);
  await auditLogger.initialize();

  const requestInspector = new RequestInspector({
    workspaceBoundary: process.cwd(),
    allowedTools: ['get_account', 'issue_refund', 'get_transaction'],
  });

  const responseInspector = new ResponseInspector();

  // Setup entities & token
  policyEngine.setEntities([
    {
      uid: { type: 'MCPSentinel::Account', id: 'ACC-1001' },
      attrs: { status: 'active', currency: 'USD' },
      parents: [],
    },
  ]);

  const tokenResult = await identityProvider.issueToken({
    subject: DEMO_IDENTITIES.FINANCIAL_REMEDIATION,
    capabilities: [Capability.LEDGER_READ, Capability.LEDGER_REFUND],
    authorizedResources: ['ACC-1001'],
    maxRefundAmount: 50,
    currency: 'USD',
  });

  const ITERATIONS = 500;
  console.log(`Running ${ITERATIONS} iterations per security subsystem...\n`);

  // 1. Identity Token Verification
  const tokenTimes: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    await identityProvider.verifyToken(tokenResult.token);
    tokenTimes.push(performance.now() - t0);
  }

  // 2. Cedar Policy Evaluation
  const cedarTimes: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    await policyEngine.evaluate({
      principal: `MCPSentinel::Agent::"${DEMO_IDENTITIES.FINANCIAL_REMEDIATION}"`,
      action: 'MCPSentinel::Action::"read_account"',
      resource: 'MCPSentinel::Account::"ACC-1001"',
      context: {},
    });
    cedarTimes.push(performance.now() - t0);
  }

  // 3. Request Inspection (Argument traversal + Injection check)
  const reqInspectTimes: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    requestInspector.inspect('issue_refund', {
      transactionId: 'TXN-2002',
      accountId: 'ACC-1001',
      amount: 29.50,
      currency: 'USD',
      memo: 'Regular customer invoice refund',
    });
    reqInspectTimes.push(performance.now() - t0);
  }

  // 4. Response Inspection (Secret scanning + Pattern matching)
  const respInspectTimes: number[] = [];
  const sampleResp = JSON.stringify({
    account: 'ACC-1001',
    balance: 5420.50,
    memo: 'Customer service request for subscription adjustment',
    status: 'active',
  });
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    responseInspector.inspect(sampleResp);
    respInspectTimes.push(performance.now() - t0);
  }

  // 5. Audit Logging + SHA-256 Hash Chain
  const auditTimes: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    await auditLogger.record({
      correlationId: generateCorrelationId(),
      agentIdentity: DEMO_IDENTITIES.FINANCIAL_REMEDIATION,
      toolName: 'read_account',
      action: 'read_account',
      eventType: SecurityEventType.TOOL_CALL_ALLOWED,
      decision: AuthzDecision.ALLOW,
    });
    auditTimes.push(performance.now() - t0);
  }

  // 6. Total Combined Interception Pipeline
  const combinedTimes: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();

    // Verification
    await identityProvider.verifyToken(tokenResult.token);
    // Request inspection
    requestInspector.inspect('read_account', { accountId: 'ACC-1001' });
    // Cedar evaluation
    await policyEngine.evaluate({
      principal: `MCPSentinel::Agent::"${DEMO_IDENTITIES.FINANCIAL_REMEDIATION}"`,
      action: 'MCPSentinel::Action::"read_account"',
      resource: 'MCPSentinel::Account::"ACC-1001"',
      context: {},
    });
    // Response inspection
    responseInspector.inspect(sampleResp);
    // Audit log
    await auditLogger.record({
      correlationId: generateCorrelationId(),
      agentIdentity: DEMO_IDENTITIES.FINANCIAL_REMEDIATION,
      toolName: 'read_account',
      action: 'read_account',
      eventType: SecurityEventType.TOOL_CALL_ALLOWED,
      decision: AuthzDecision.ALLOW,
    });

    combinedTimes.push(performance.now() - t0);
  }

  await auditLogger.close();

  // Print results table
  console.log('| Subsystem                      |  Avg (ms) |  P50 (ms) |  P95 (ms) |  P99 (ms) |');
  console.log('|--------------------------------|-----------|-----------|-----------|-----------|');
  formatRow('EdDSA Token Verification', calculateStats(tokenTimes));
  formatRow('Cedar WASM Authorization', calculateStats(cedarTimes));
  formatRow('Request Argument Inspection', calculateStats(reqInspectTimes));
  formatRow('Response Secret Inspection', calculateStats(respInspectTimes));
  formatRow('Audit Hash-Chain Write', calculateStats(auditTimes));
  console.log('|--------------------------------|-----------|-----------|-----------|-----------|');
  formatRow('TOTAL END-TO-END PIPELINE', calculateStats(combinedTimes));
  console.log('\n============================================================');
  console.log('Conclusion: Complete zero-trust security mediation operates');
  console.log(`in < ${calculateStats(combinedTimes).p95.toFixed(2)} ms (P95), adding imperceptible overhead`);
  console.log('to AI agent tool invocations (typically 50-500ms network I/O).');
  console.log('============================================================\n');
}

main().catch(console.error);
