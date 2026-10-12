// ============================================================
// MCP Sentinel — Audit Logger Tests
// Persistence, hash chain integrity, querying
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuditLogger } from '../src/audit-logger.js';
import { SecurityEventType, AuthzDecision } from '@mcp-sentinel/shared';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('AuditLogger', () => {
  let logger: AuditLogger;
  const dbPath = join(tmpdir(), `sentinel-test-${Date.now()}.db`);

  beforeEach(async () => {
    logger = new AuditLogger(dbPath);
    await logger.initialize();
  });

  afterEach(() => {
    logger.close();
    try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* ok */ }
  });

  it('records and retrieves events', async () => {
    await logger.record({
      correlationId: 'test-corr-1',
      agentIdentity: 'spiffe://demo.local/agent/test',
      toolName: 'get_account',
      action: 'call_tool',
      eventType: SecurityEventType.TOOL_CALL_ALLOWED,
      decision: AuthzDecision.ALLOW,
    });

    const events = logger.query({});
    expect(events.length).toBe(1);
    expect(events[0].toolName).toBe('get_account');
    expect(events[0].decision).toBe('ALLOW');
  });

  it('maintains hash chain integrity', async () => {
    for (let i = 0; i < 5; i++) {
      await logger.record({
        correlationId: `corr-${i}`,
        agentIdentity: 'test-agent',
        toolName: `tool-${i}`,
        action: 'test',
        eventType: SecurityEventType.TOOL_CALL_ALLOWED,
      });
    }

    const integrity = logger.verifyIntegrity();
    expect(integrity.valid).toBe(true);
    expect(integrity.checkedCount).toBe(5);
  });

  it('filters events by decision', async () => {
    await logger.record({
      correlationId: 'c1', agentIdentity: 'a1', toolName: 't1', action: 'a',
      eventType: SecurityEventType.TOOL_CALL_ALLOWED, decision: AuthzDecision.ALLOW,
    });
    await logger.record({
      correlationId: 'c2', agentIdentity: 'a1', toolName: 't2', action: 'a',
      eventType: SecurityEventType.TOOL_CALL_DENIED, decision: AuthzDecision.DENY,
    });

    const allowed = logger.query({ decision: 'ALLOW' });
    expect(allowed.length).toBe(1);
    expect(allowed[0].toolName).toBe('t1');

    const denied = logger.query({ decision: 'DENY' });
    expect(denied.length).toBe(1);
    expect(denied[0].toolName).toBe('t2');
  });

  it('computes metrics', async () => {
    await logger.record({
      correlationId: 'c1', agentIdentity: 'a1', toolName: 't1', action: 'a',
      eventType: SecurityEventType.TOOL_CALL_ALLOWED, decision: AuthzDecision.ALLOW,
    });
    await logger.record({
      correlationId: 'c2', agentIdentity: 'a2', toolName: 't2', action: 'a',
      eventType: SecurityEventType.TOOL_CALL_DENIED, decision: AuthzDecision.DENY,
    });

    const metrics = logger.getMetrics();
    expect(metrics.total).toBe(2);
    expect(metrics.allowed).toBe(1);
    expect(metrics.denied).toBe(1);
  });

  it('reset clears all data', async () => {
    await logger.record({
      correlationId: 'c1', agentIdentity: 'a1', toolName: 't1', action: 'a',
      eventType: SecurityEventType.TOOL_CALL_ALLOWED,
    });

    logger.reset();
    const events = logger.query({});
    expect(events.length).toBe(0);
  });
});
