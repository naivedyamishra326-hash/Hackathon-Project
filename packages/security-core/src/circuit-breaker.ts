// ============================================================
// MCP Sentinel — Autonomous Circuit Breaker
// Self-healing defense: automatically isolates compromised agents
// ============================================================

import type { CircuitBreakerStatus } from '@mcp-sentinel/shared';
import { nowISO } from '@mcp-sentinel/shared';

export interface CircuitBreakerConfig {
  violationThreshold?: number;
  windowMs?: number;
}

interface AgentViolationRecord {
  timestamps: number[];
  quarantinedAt?: string;
  reason?: string;
}

export class CircuitBreaker {
  private threshold: number;
  private windowMs: number;
  private records: Map<string, AgentViolationRecord> = new Map();

  constructor(config: CircuitBreakerConfig = {}) {
    this.threshold = config.violationThreshold ?? 3;
    this.windowMs = config.windowMs ?? 60_000;
  }

  /**
   * Record a security violation for an agent.
   * If threshold is reached within sliding window, agent is quarantined.
   */
  recordViolation(agentIdentity: string, reason: string): {
    state: 'NORMAL' | 'WARNING' | 'QUARANTINED';
    tripped: boolean;
    violationCount: number;
  } {
    const now = Date.now();
    let record = this.records.get(agentIdentity);
    if (!record) {
      record = { timestamps: [] };
      this.records.set(agentIdentity, record);
    }

    // Clean up timestamps outside window
    record.timestamps = record.timestamps.filter(t => now - t < this.windowMs);
    record.timestamps.push(now);

    const violationCount = record.timestamps.length;

    if (violationCount >= this.threshold) {
      const alreadyQuarantined = !!record.quarantinedAt;
      record.quarantinedAt = record.quarantinedAt || nowISO();
      record.reason = reason;

      return {
        state: 'QUARANTINED',
        tripped: !alreadyQuarantined, // true only on first transition
        violationCount,
      };
    }

    if (violationCount >= 1) {
      return {
        state: 'WARNING',
        tripped: false,
        violationCount,
      };
    }

    return {
      state: 'NORMAL',
      tripped: false,
      violationCount: 0,
    };
  }

  /**
   * Check if an agent is currently quarantined.
   */
  isQuarantined(agentIdentity: string): boolean {
    const record = this.records.get(agentIdentity);
    return !!record?.quarantinedAt;
  }

  /**
   * Reset quarantine status for an agent.
   */
  reset(agentIdentity: string): void {
    this.records.delete(agentIdentity);
  }

  /**
   * Reset all agents.
   */
  resetAll(): void {
    this.records.clear();
  }

  /**
   * Get status for a specific agent.
   */
  getStatus(agentIdentity: string): CircuitBreakerStatus {
    const record = this.records.get(agentIdentity);
    if (!record) {
      return {
        agentIdentity,
        state: 'NORMAL',
        violationCount: 0,
        threshold: this.threshold,
      };
    }

    const now = Date.now();
    const activeViolations = record.timestamps.filter(t => now - t < this.windowMs);

    return {
      agentIdentity,
      state: record.quarantinedAt ? 'QUARANTINED' : activeViolations.length > 0 ? 'WARNING' : 'NORMAL',
      violationCount: activeViolations.length,
      threshold: this.threshold,
      lastViolationAt: activeViolations.length > 0 ? new Date(activeViolations[activeViolations.length - 1]).toISOString() : undefined,
      quarantinedAt: record.quarantinedAt,
      reason: record.reason,
    };
  }

  /**
   * Get statuses for all tracked agents.
   */
  getAllStatuses(): CircuitBreakerStatus[] {
    const statuses: CircuitBreakerStatus[] = [];
    for (const agent of this.records.keys()) {
      statuses.push(this.getStatus(agent));
    }
    return statuses;
  }
}
