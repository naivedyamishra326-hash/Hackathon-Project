// ============================================================
// MCP Sentinel — Refund Confirmation Service
// Manages server-side pending refunds requiring explicit human confirmation.
// Model proposed refunds are prepared but NEVER executed without human approval.
// ============================================================

import { randomBytes } from 'node:crypto';
import { nowISO } from '@mcp-sentinel/shared';

export interface PendingRefund {
  confirmationId: string;
  transactionId: string;
  accountId: string;
  amount: number;
  currency: string;
  reason: string;
  createdAt: string;
  expiresAt: string;
  sessionId?: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'EXPIRED';
  executionResult?: Record<string, unknown>;
}

export class RefundConfirmationService {
  private pendingStore: Map<string, PendingRefund> = new Map();
  private ttlMs: number;

  constructor(ttlMs: number = 5 * 60 * 1000) { // 5 minutes TTL
    this.ttlMs = ttlMs;
  }

  /**
   * Create a pending refund proposal from trusted server-side parameters.
   */
  createPendingRefund(params: {
    transactionId: string;
    accountId: string;
    amount: number;
    currency?: string;
    reason: string;
    sessionId?: string;
  }): PendingRefund {
    const confirmationId = `ref-conf-${randomBytes(12).toString('hex')}`;
    const createdAt = nowISO();
    const expiresAt = new Date(Date.now() + this.ttlMs).toISOString();

    const pending: PendingRefund = {
      confirmationId,
      transactionId: params.transactionId,
      accountId: params.accountId,
      amount: Number(params.amount),
      currency: params.currency || 'USD',
      reason: params.reason || 'Customer requested refund',
      createdAt,
      expiresAt,
      sessionId: params.sessionId,
      status: 'PENDING',
    };

    this.pendingStore.set(confirmationId, pending);
    return pending;
  }

  /**
   * Get pending refund details by confirmation ID.
   */
  getPendingRefund(confirmationId: string): PendingRefund | null {
    const item = this.pendingStore.get(confirmationId);
    if (!item) return null;

    // Check expiry
    if (item.status === 'PENDING' && new Date(item.expiresAt).getTime() < Date.now()) {
      item.status = 'EXPIRED';
    }

    return item;
  }

  /**
   * Validate and atomically consume a pending confirmation for execution.
   * Prevents replay attacks, duplicate executions, and expired confirmations.
   */
  consumeConfirmation(confirmationId: string): {
    valid: boolean;
    refund?: PendingRefund;
    error?: string;
  } {
    const item = this.getPendingRefund(confirmationId);
    if (!item) {
      return { valid: false, error: 'Confirmation ID not found or invalid' };
    }

    if (item.status === 'EXPIRED') {
      return { valid: false, error: 'Refund confirmation has expired. Please request a new refund.' };
    }

    if (item.status === 'CONFIRMED') {
      return { valid: false, error: 'This refund has already been confirmed and executed.' };
    }

    if (item.status === 'REJECTED') {
      return { valid: false, error: 'This refund was previously rejected.' };
    }

    // Atomically mark as confirmed
    item.status = 'CONFIRMED';
    return { valid: true, refund: item };
  }

  /**
   * Explicitly reject a pending refund proposal.
   */
  rejectConfirmation(confirmationId: string): { valid: boolean; error?: string } {
    const item = this.getPendingRefund(confirmationId);
    if (!item) {
      return { valid: false, error: 'Confirmation ID not found' };
    }

    if (item.status !== 'PENDING') {
      return { valid: false, error: `Cannot reject: refund is already in status ${item.status}` };
    }

    item.status = 'REJECTED';
    return { valid: true };
  }

  /**
   * List all pending confirmations (optionally filtered by session).
   */
  listPending(sessionId?: string): PendingRefund[] {
    const now = Date.now();
    const result: PendingRefund[] = [];

    for (const item of this.pendingStore.values()) {
      if (item.status === 'PENDING' && new Date(item.expiresAt).getTime() < now) {
        item.status = 'EXPIRED';
      }
      if (sessionId && item.sessionId !== sessionId) continue;
      result.push(item);
    }

    return result;
  }

  /**
   * Clear all (for testing).
   */
  clear(): void {
    this.pendingStore.clear();
  }
}

export const defaultRefundService = new RefundConfirmationService();
