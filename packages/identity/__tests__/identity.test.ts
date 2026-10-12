// ============================================================
// MCP Sentinel — Identity & Delegation Tests
// Token lifecycle, delegation attenuation, revocation
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { IdentityProvider } from '../src/identity-provider.js';
import { Capability } from '@mcp-sentinel/shared';

describe('IdentityProvider', () => {
  let provider: IdentityProvider;

  beforeEach(async () => {
    provider = new IdentityProvider();
    await provider.initialize();
  });

  describe('Token issuance & verification', () => {
    it('issues a valid token', async () => {
      const { token, claims } = await provider.issueToken({
        subject: 'spiffe://demo.local/agent/test',
        capabilities: [Capability.LEDGER_READ],
      });
      expect(token).toBeTruthy();
      expect(claims.sub).toBe('spiffe://demo.local/agent/test');
      expect(claims.capabilities).toContain(Capability.LEDGER_READ);
    });

    it('verifies a valid token', async () => {
      const { token } = await provider.issueToken({
        subject: 'spiffe://demo.local/agent/test',
        capabilities: [Capability.LEDGER_READ],
      });
      const result = await provider.verifyToken(token);
      expect(result.valid).toBe(true);
      expect(result.claims?.sub).toBe('spiffe://demo.local/agent/test');
    });

    it('rejects a tampered token', async () => {
      const { token } = await provider.issueToken({
        subject: 'spiffe://demo.local/agent/test',
        capabilities: [Capability.LEDGER_READ],
      });
      const tampered = token.slice(0, -5) + 'XXXXX';
      const result = await provider.verifyToken(tampered);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('verification failed');
    });

    it('rejects an expired token', async () => {
      const { token } = await provider.issueToken({
        subject: 'spiffe://demo.local/agent/test',
        capabilities: [Capability.LEDGER_READ],
        ttlSeconds: -1, // Already expired
      });
      const result = await provider.verifyToken(token);
      expect(result.valid).toBe(false);
    });
  });

  describe('Token revocation', () => {
    it('revokes a token', async () => {
      const { token, claims } = await provider.issueToken({
        subject: 'spiffe://demo.local/agent/test',
        capabilities: [Capability.LEDGER_READ],
      });

      // Before revocation
      let result = await provider.verifyToken(token);
      expect(result.valid).toBe(true);

      // Revoke
      provider.revokeToken(claims.jti, 'Test revocation');

      // After revocation
      result = await provider.verifyToken(token);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('revoked');
    });

    it('cascades revocation to children', async () => {
      const parent = await provider.issueToken({
        subject: 'spiffe://demo.local/agent/parent',
        capabilities: [Capability.LEDGER_READ, Capability.LEDGER_REFUND],
        authorizedResources: ['ACC-1001'],
        maxRefundAmount: 50,
      });

      const child = await provider.delegate({
        parentToken: parent.token,
        childSubject: 'spiffe://demo.local/agent/child',
        childCapabilities: [Capability.LEDGER_READ],
      });
      expect(child.success).toBe(true);

      // Revoke parent
      provider.revokeToken(parent.claims.jti, 'Parent revocation');

      // Child should also be revoked
      const childResult = await provider.verifyToken(child.token!.token);
      expect(childResult.valid).toBe(false);
    });
  });

  describe('Delegation with monotonic attenuation', () => {
    it('allows delegation with subset capabilities', async () => {
      const parent = await provider.issueToken({
        subject: 'spiffe://demo.local/agent/parent',
        capabilities: [Capability.LEDGER_READ, Capability.LEDGER_REFUND],
        authorizedResources: ['ACC-1001'],
        maxRefundAmount: 50,
      });

      const result = await provider.delegate({
        parentToken: parent.token,
        childSubject: 'spiffe://demo.local/agent/child',
        childCapabilities: [Capability.LEDGER_READ], // Subset
      });

      expect(result.success).toBe(true);
      expect(result.delegation!.childCapabilities).toEqual([Capability.LEDGER_READ]);
    });

    it('BLOCKS capability escalation', async () => {
      const parent = await provider.issueToken({
        subject: 'spiffe://demo.local/agent/parent',
        capabilities: [Capability.LEDGER_READ], // Only read
      });

      const result = await provider.delegate({
        parentToken: parent.token,
        childSubject: 'spiffe://demo.local/agent/child',
        childCapabilities: [Capability.LEDGER_READ, Capability.LEDGER_REFUND], // Escalation!
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('escalation denied');
    });

    it('BLOCKS amount escalation', async () => {
      const parent = await provider.issueToken({
        subject: 'spiffe://demo.local/agent/parent',
        capabilities: [Capability.LEDGER_REFUND],
        maxRefundAmount: 50,
      });

      const result = await provider.delegate({
        parentToken: parent.token,
        childSubject: 'spiffe://demo.local/agent/child',
        childCapabilities: [Capability.LEDGER_REFUND],
        childMaxRefundAmount: 500, // Escalation!
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Amount escalation denied');
    });

    it('BLOCKS resource escalation', async () => {
      const parent = await provider.issueToken({
        subject: 'spiffe://demo.local/agent/parent',
        capabilities: [Capability.LEDGER_READ],
        authorizedResources: ['ACC-1001'],
      });

      const result = await provider.delegate({
        parentToken: parent.token,
        childSubject: 'spiffe://demo.local/agent/child',
        childCapabilities: [Capability.LEDGER_READ],
        childAuthorizedResources: ['ACC-1001', 'ACC-1002'], // Escalation!
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Resource escalation denied');
    });

    it('BLOCKS delegation from revoked parent', async () => {
      const parent = await provider.issueToken({
        subject: 'spiffe://demo.local/agent/parent',
        capabilities: [Capability.LEDGER_READ],
      });

      provider.revokeToken(parent.claims.jti, 'Test');

      const result = await provider.delegate({
        parentToken: parent.token,
        childSubject: 'spiffe://demo.local/agent/child',
        childCapabilities: [Capability.LEDGER_READ],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('invalid');
    });
  });
});
