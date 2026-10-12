// ============================================================
// MCP Sentinel — Behavioral Analyzer
// Session-aware event correlation and attack chain detection
// ============================================================

import type { AuditEvent, RiskLevel } from '@mcp-sentinel/shared';

export interface BehavioralIncident {
  id: string;
  sessionId: string;
  agentIdentity: string;
  severity: RiskLevel;
  description: string;
  eventChain: {
    eventId: string;
    timestamp: string;
    toolName: string;
    eventType: string;
    decision?: string;
    finding?: string;
  }[];
  detectedAt: string;
  status: 'detected' | 'investigating' | 'confirmed' | 'false_positive';
}

/**
 * Behavioral analyzer for detecting suspicious action sequences.
 * 
 * This module correlates individual events into behavioral patterns.
 * It is separate from the Cedar authorization engine.
 * 
 * IMPORTANT: A low behavioral risk score NEVER overrides an explicit
 * Cedar DENY decision.
 */
export class BehavioralAnalyzer {
  private sessionEvents: Map<string, AuditEvent[]> = new Map();
  private incidents: BehavioralIncident[] = [];

  /**
   * Process a new audit event and check for suspicious sequences.
   */
  processEvent(event: AuditEvent): BehavioralIncident | null {
    const sessionId = event.sessionId || event.correlationId;
    if (!sessionId) return null;

    // Store event in session
    if (!this.sessionEvents.has(sessionId)) {
      this.sessionEvents.set(sessionId, []);
    }
    this.sessionEvents.get(sessionId)!.push(event);

    // Check for attack chain patterns
    const sessionHistory = this.sessionEvents.get(sessionId)!;
    return this.detectAttackChain(sessionId, sessionHistory, event);
  }

  /**
   * Detect attack chain patterns in event sequences.
   * 
   * Pattern: Data access → Secret/credential detection → Unauthorized action → Exfiltration attempt
   */
  private detectAttackChain(sessionId: string, events: AuditEvent[], latestEvent: AuditEvent): BehavioralIncident | null {
    if (events.length < 2) return null;

    // Look for sequences of concerning events
    const recent = events.slice(-10); // Last 10 events in session
    const concerns: typeof recent = [];

    for (const evt of recent) {
      const isConcerning = 
        evt.eventType === 'PROMPT_INJECTION_DETECTED' ||
        evt.eventType === 'SECRET_DETECTED' ||
        evt.eventType === 'TOOL_CALL_DENIED' ||
        evt.eventType === 'CAPABILITY_VIOLATION' ||
        evt.eventType === 'PATH_TRAVERSAL_BLOCKED' ||
        evt.eventType === 'SSRF_BLOCKED' ||
        evt.eventType === 'COMMAND_INJECTION_BLOCKED' ||
        evt.eventType === 'TOKEN_REJECTED' ||
        evt.eventType === 'DELEGATION_VIOLATION';

      if (isConcerning) {
        concerns.push(evt);
      }
    }

    // If we have 3+ concerning events, flag an incident
    if (concerns.length >= 3) {
      const incident: BehavioralIncident = {
        id: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sessionId,
        agentIdentity: latestEvent.agentIdentity,
        severity: concerns.length >= 5 ? 'CRITICAL' as RiskLevel : 'HIGH' as RiskLevel,
        description: `Suspicious sequence detected: ${concerns.length} concerning events in session`,
        eventChain: concerns.map(evt => ({
          eventId: evt.id,
          timestamp: evt.timestamp,
          toolName: evt.toolName,
          eventType: evt.eventType,
          decision: evt.decision,
          finding: evt.details?.finding as string | undefined,
        })),
        detectedAt: new Date().toISOString(),
        status: 'detected',
      };

      this.incidents.push(incident);
      return incident;
    }

    // Special case: prompt injection followed by denied action
    const hasInjection = recent.some(e => e.eventType === 'PROMPT_INJECTION_DETECTED');
    const hasDenied = recent.some(e => e.eventType === 'TOOL_CALL_DENIED');
    
    if (hasInjection && hasDenied) {
      const relevantEvents = recent.filter(e => 
        e.eventType === 'PROMPT_INJECTION_DETECTED' || 
        e.eventType === 'TOOL_CALL_DENIED'
      );

      const incident: BehavioralIncident = {
        id: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sessionId,
        agentIdentity: latestEvent.agentIdentity,
        severity: 'HIGH' as RiskLevel,
        description: 'Prompt injection followed by denied tool call — possible injection-driven unauthorized action',
        eventChain: relevantEvents.map(evt => ({
          eventId: evt.id,
          timestamp: evt.timestamp,
          toolName: evt.toolName,
          eventType: evt.eventType,
          decision: evt.decision,
        })),
        detectedAt: new Date().toISOString(),
        status: 'detected',
      };

      this.incidents.push(incident);
      return incident;
    }

    return null;
  }

  /**
   * Get all incidents.
   */
  getIncidents(): BehavioralIncident[] {
    return [...this.incidents];
  }

  /**
   * Get incidents for a specific session.
   */
  getSessionIncidents(sessionId: string): BehavioralIncident[] {
    return this.incidents.filter(i => i.sessionId === sessionId);
  }

  /**
   * Reset all state (for demo).
   */
  reset(): void {
    this.sessionEvents.clear();
    this.incidents = [];
  }
}

export default BehavioralAnalyzer;
