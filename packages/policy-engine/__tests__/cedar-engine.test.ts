import { describe, it, expect, beforeAll } from 'vitest';
import { resolve, join } from 'node:path';
import { CedarPolicyEngine } from '../src/cedar-engine.js';
import { AuthzDecision, DEMO_IDENTITIES } from '@mcp-sentinel/shared';

const POLICY_DIR = resolve(__dirname, '../../../policies');

describe('CedarPolicyEngine', () => {
  let engine: CedarPolicyEngine;

  beforeAll(async () => {
    engine = new CedarPolicyEngine({ policyDir: POLICY_DIR });
    await engine.initialize();
  });

  it('should initialize and load policies successfully', () => {
    expect(engine.isReady()).toBe(true);
    const policies = engine.getPolicies();
    expect(policies.length).toBeGreaterThanOrEqual(2);
    expect(policies.some(p => p.name === 'fintech.cedar')).toBe(true);
    expect(policies.some(p => p.name === 'base.cedar')).toBe(true);
  });

  it('should allow legitimate account read for financial remediation agent on active account', async () => {
    engine.setEntities([
      {
        uid: { type: 'MCPSentinel::Account', id: 'ACC-1001' },
        attrs: { status: 'active', currency: 'USD' },
        parents: [],
      },
    ]);

    const result = await engine.evaluate({
      principal: `MCPSentinel::Agent::"${DEMO_IDENTITIES.FINANCIAL_REMEDIATION}"`,
      action: 'MCPSentinel::Action::"read_account"',
      resource: 'MCPSentinel::Account::"ACC-1001"',
      context: {},
    });

    expect(result.decision).toBe(AuthzDecision.ALLOW);
    expect(result.evaluationTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should allow legitimate refund for ACC-1001 within $50 limit', async () => {
    const result = await engine.evaluate({
      principal: `MCPSentinel::Agent::"${DEMO_IDENTITIES.FINANCIAL_REMEDIATION}"`,
      action: 'MCPSentinel::Action::"issue_refund"',
      resource: 'MCPSentinel::Account::"ACC-1001"',
      context: { requestedAmount: 2950, currency: 'USD' }, // 29.50 in cents
    });

    expect(result.decision).toBe(AuthzDecision.ALLOW);
  });

  it('should deny refund exceeding limit (> 5000 cents)', async () => {
    const result = await engine.evaluate({
      principal: `MCPSentinel::Agent::"${DEMO_IDENTITIES.FINANCIAL_REMEDIATION}"`,
      action: 'MCPSentinel::Action::"issue_refund"',
      resource: 'MCPSentinel::Account::"ACC-1001"',
      context: { requestedAmount: 85000, currency: 'USD' }, // $850.00
    });

    expect(result.decision).toBe(AuthzDecision.DENY);
  });

  it('should deny refund to unapproved account', async () => {
    const result = await engine.evaluate({
      principal: `MCPSentinel::Agent::"${DEMO_IDENTITIES.FINANCIAL_REMEDIATION}"`,
      action: 'MCPSentinel::Action::"issue_refund"',
      resource: 'MCPSentinel::Account::"ACC-9999"',
      context: { requestedAmount: 1000, currency: 'USD' },
    });

    expect(result.decision).toBe(AuthzDecision.DENY);
  });

  it('should deny forbidden actions like write_resource or shell execution', async () => {
    const result = await engine.evaluate({
      principal: `MCPSentinel::Agent::"${DEMO_IDENTITIES.FINANCIAL_REMEDIATION}"`,
      action: 'MCPSentinel::Action::"execute_command"',
      resource: 'MCPSentinel::Tool::"bash"',
      context: {},
    });

    expect(result.decision).toBe(AuthzDecision.DENY);
  });

  it('should enforce revoked token guardrail via forbid policy', async () => {
    const result = await engine.evaluate({
      principal: `MCPSentinel::Agent::"${DEMO_IDENTITIES.FINANCIAL_REMEDIATION}"`,
      action: 'MCPSentinel::Action::"read_account"',
      resource: 'MCPSentinel::Account::"ACC-1001"',
      context: { isRevoked: true },
    });

    expect(result.decision).toBe(AuthzDecision.DENY);
  });

  it('should validate valid Cedar policy text', async () => {
    const validPolicy = 'permit(principal, action, resource);';
    const validation = await engine.validatePolicy(validPolicy);
    expect(validation.valid).toBe(true);
  });

  it('should reject invalid Cedar policy text with clear syntax error', async () => {
    const invalidPolicy = 'permit(broken syntax here!';
    const validation = await engine.validatePolicy(invalidPolicy);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it('should support rollback to previous valid policy state', () => {
    const originalText = engine.getPolicyText();
    engine.rollback();
    expect(engine.getPolicyText()).toBe(originalText);
  });
});
