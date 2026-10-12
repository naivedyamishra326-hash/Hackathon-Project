// ============================================================
// MCP Sentinel — Identity Module
// JWT-based local identity with SPIFFE-style subjects,
// delegation chains, and revocation
// ============================================================

import { generateKeyPair, exportJWK, importJWK, type KeyLike } from 'jose';
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import type { TokenClaims, Capability, DelegationRecord, RevocationEntry } from '@mcp-sentinel/shared';
import { TOKEN_CONFIG, nowISO } from '@mcp-sentinel/shared';

export interface IssuedToken {
  token: string;
  claims: TokenClaims;
}

/**
 * Local demonstration identity provider.
 * 
 * LIMITATIONS (documented per spec requirements):
 * - This is a local identity issuer for hackathon demonstration
 * - It does NOT implement SPIRE workload attestation
 * - It does NOT implement a production-grade identity provider
 * - It models the interface that a real SPIFFE/SPIRE integration would use
 * - Private keys are held in-memory; not backed by HSM
 */
export class IdentityProvider {
  private privateKey: KeyLike | null = null;
  private publicKey: KeyLike | null = null;
  private publicJWK: Record<string, unknown> = {};
  private revocationStore: Map<string, RevocationEntry> = new Map();
  private delegationStore: Map<string, DelegationRecord> = new Map();
  private tokenParentMap: Map<string, string> = new Map(); // childTokenId -> parentTokenId
  private initialized = false;

  async initialize(): Promise<void> {
    // Generate Ed25519 key pair for signing
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.publicJWK = await exportJWK(publicKey) as Record<string, unknown>;
    this.initialized = true;
  }

  /**
   * Issue a signed JWT for a demonstration agent identity.
   */
  async issueToken(params: {
    subject: string;
    capabilities: Capability[];
    authorizedResources?: string[];
    maxRefundAmount?: number;
    currency?: string;
    ttlSeconds?: number;
    parentTokenId?: string;
    actor?: string;
  }): Promise<IssuedToken> {
    if (!this.initialized || !this.privateKey) {
      throw new Error('IdentityProvider not initialized');
    }

    const jti = `tok-${randomUUID()}`;
    const now = Math.floor(Date.now() / 1000);
    const ttl = params.ttlSeconds || TOKEN_CONFIG.DEFAULT_TTL_SECONDS;

    const claims: TokenClaims = {
      iss: TOKEN_CONFIG.ISSUER,
      sub: params.subject,
      aud: TOKEN_CONFIG.AUDIENCE,
      iat: now,
      exp: now + ttl,
      jti,
      capabilities: params.capabilities,
      authorizedResources: params.authorizedResources,
      maxRefundAmount: params.maxRefundAmount,
      currency: params.currency,
      parentTokenId: params.parentTokenId,
    };

    if (params.actor) {
      claims.act = { sub: params.actor };
    }

    // Track parent-child relationship
    if (params.parentTokenId) {
      this.tokenParentMap.set(jti, params.parentTokenId);
    }

    const token = await new SignJWT(claims as unknown as Record<string, unknown>)
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(now + ttl)
      .setIssuer(TOKEN_CONFIG.ISSUER)
      .setAudience(TOKEN_CONFIG.AUDIENCE)
      .setSubject(params.subject)
      .setJti(jti)
      .sign(this.privateKey);

    return { token, claims };
  }

  /**
   * Verify a token: signature, expiry, issuer, audience, revocation.
   */
  async verifyToken(token: string): Promise<{
    valid: boolean;
    claims?: TokenClaims;
    error?: string;
  }> {
    if (!this.initialized || !this.publicKey) {
      return { valid: false, error: 'IdentityProvider not initialized' };
    }

    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        issuer: TOKEN_CONFIG.ISSUER,
        audience: TOKEN_CONFIG.AUDIENCE,
        algorithms: ['EdDSA'],
      });

      const claims = payload as unknown as TokenClaims;

      // Check revocation
      if (claims.jti && this.isRevoked(claims.jti)) {
        return { valid: false, claims, error: 'Token has been revoked' };
      }

      // Check parent revocation (cascading)
      if (claims.parentTokenId && this.isRevoked(claims.parentTokenId)) {
        return { valid: false, claims, error: 'Parent token has been revoked' };
      }

      return { valid: true, claims };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { valid: false, error: `Token verification failed: ${message}` };
    }
  }

  /**
   * Create a delegated child token with attenuated capabilities.
   * Enforces: Capabilities(child) ⊆ Capabilities(parent)
   */
  async delegate(params: {
    parentToken: string;
    childSubject: string;
    childCapabilities: Capability[];
    childAuthorizedResources?: string[];
    childMaxRefundAmount?: number;
    ttlSeconds?: number;
  }): Promise<{
    success: boolean;
    token?: IssuedToken;
    delegation?: DelegationRecord;
    error?: string;
  }> {
    // Verify parent token first
    const parentResult = await this.verifyToken(params.parentToken);
    if (!parentResult.valid || !parentResult.claims) {
      return { success: false, error: `Parent token invalid: ${parentResult.error}` };
    }

    const parentClaims = parentResult.claims;

    // Enforce monotonic attenuation: child capabilities must be subset of parent
    const parentCaps = new Set(parentClaims.capabilities);
    for (const cap of params.childCapabilities) {
      if (!parentCaps.has(cap)) {
        return {
          success: false,
          error: `Capability escalation denied: child requests '${cap}' not held by parent`,
        };
      }
    }

    // Enforce resource constraints: child resources must be subset of parent resources
    if (params.childAuthorizedResources && parentClaims.authorizedResources) {
      const parentResources = new Set(parentClaims.authorizedResources);
      for (const res of params.childAuthorizedResources) {
        if (!parentResources.has(res)) {
          return {
            success: false,
            error: `Resource escalation denied: child requests '${res}' not authorized for parent`,
          };
        }
      }
    }

    // Enforce amount constraints: child max must be <= parent max
    if (params.childMaxRefundAmount !== undefined && parentClaims.maxRefundAmount !== undefined) {
      if (params.childMaxRefundAmount > parentClaims.maxRefundAmount) {
        return {
          success: false,
          error: `Amount escalation denied: child requests ${params.childMaxRefundAmount} > parent max ${parentClaims.maxRefundAmount}`,
        };
      }
    }

    // Enforce TTL: child cannot outlive parent
    const parentTTL = parentClaims.exp - Math.floor(Date.now() / 1000);
    const childTTL = Math.min(params.ttlSeconds || TOKEN_CONFIG.DEFAULT_TTL_SECONDS, parentTTL);

    // Issue the child token
    const childToken = await this.issueToken({
      subject: params.childSubject,
      capabilities: params.childCapabilities,
      authorizedResources: params.childAuthorizedResources || parentClaims.authorizedResources,
      maxRefundAmount: params.childMaxRefundAmount ?? parentClaims.maxRefundAmount,
      currency: parentClaims.currency,
      ttlSeconds: childTTL,
      parentTokenId: parentClaims.jti,
      actor: parentClaims.sub,
    });

    // Record delegation
    const delegation: DelegationRecord = {
      id: `del-${randomUUID()}`,
      parentTokenId: parentClaims.jti,
      childTokenId: childToken.claims.jti,
      parentIdentity: parentClaims.sub,
      childIdentity: params.childSubject,
      parentCapabilities: parentClaims.capabilities,
      childCapabilities: params.childCapabilities,
      constraints: {
        maxRefundAmount: params.childMaxRefundAmount ?? parentClaims.maxRefundAmount,
        authorizedResources: params.childAuthorizedResources || parentClaims.authorizedResources,
      },
      createdAt: nowISO(),
      expiresAt: new Date((childToken.claims.exp) * 1000).toISOString(),
      revoked: false,
    };

    this.delegationStore.set(delegation.id, delegation);

    return { success: true, token: childToken, delegation };
  }

  /**
   * Revoke a token and optionally propagate to children.
   */
  revokeToken(tokenId: string, reason: string, propagateToChildren: boolean = true): void {
    const entry: RevocationEntry = {
      tokenId,
      revokedAt: nowISO(),
      reason,
      propagateToChildren,
    };
    this.revocationStore.set(tokenId, entry);

    // Propagate to children
    if (propagateToChildren) {
      for (const [childId, parentId] of this.tokenParentMap.entries()) {
        if (parentId === tokenId) {
          this.revokeToken(childId, `Parent token ${tokenId} revoked: ${reason}`, true);
        }
      }
    }
  }

  /**
   * Check if a token ID is revoked.
   */
  isRevoked(tokenId: string): boolean {
    if (this.revocationStore.has(tokenId)) return true;

    // Check parent chain
    const parentId = this.tokenParentMap.get(tokenId);
    if (parentId) return this.isRevoked(parentId);

    return false;
  }

  /**
   * Get all delegations.
   */
  getDelegations(): DelegationRecord[] {
    return Array.from(this.delegationStore.values());
  }

  /**
   * Get all revocations.
   */
  getRevocations(): RevocationEntry[] {
    return Array.from(this.revocationStore.values());
  }

  /**
   * Get public JWK for external verification.
   */
  getPublicJWK(): Record<string, unknown> {
    return { ...this.publicJWK };
  }

  /**
   * Reset all state (for demo).
   */
  resetState(): void {
    this.revocationStore.clear();
    this.delegationStore.clear();
    this.tokenParentMap.clear();
  }
}

export default IdentityProvider;
