// ============================================================
// MCP Sentinel — Audit Logger with Hash Chain Integrity
// Uses sql.js (pure JS SQLite WASM) for persistence
// ============================================================

import initSqlJs, { type Database } from 'sql.js';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AuditEvent } from '@mcp-sentinel/shared';
import { generateEventId, nowISO, sha256 } from '@mcp-sentinel/shared';

// Event emitter for SSE distribution
type EventListener = (event: AuditEvent) => void;

export class AuditLogger {
  private db: Database | null = null;
  private dbPath: string;
  private lastHash: string = '0000000000000000000000000000000000000000000000000000000000000000';
  private listeners: EventListener[] = [];
  private initialized = false;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    const SQL = await initSqlJs();

    // Load existing DB or create new
    if (existsSync(this.dbPath)) {
      const buffer = readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      const dir = dirname(this.dbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      this.db = new SQL.Database();
    }

    this.createTables();
    this.loadLastHash();
    this.initialized = true;
  }

  private createTables(): void {
    this.db!.run(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        correlation_id TEXT,
        session_id TEXT,
        agent_identity TEXT NOT NULL,
        human_subject TEXT,
        tool_name TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_id TEXT,
        event_type TEXT NOT NULL,
        decision TEXT,
        policy_id TEXT,
        risk_assessment TEXT,
        sanitized_args TEXT,
        outcome TEXT,
        delegation_id TEXT,
        parent_event_id TEXT,
        details TEXT,
        previous_hash TEXT,
        event_hash TEXT
      )
    `);

    this.db!.run(`
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON audit_events(timestamp)
    `);
    this.db!.run(`
      CREATE INDEX IF NOT EXISTS idx_events_agent ON audit_events(agent_identity)
    `);
    this.db!.run(`
      CREATE INDEX IF NOT EXISTS idx_events_type ON audit_events(event_type)
    `);
    this.db!.run(`
      CREATE INDEX IF NOT EXISTS idx_events_correlation ON audit_events(correlation_id)
    `);
    this.db!.run(`
      CREATE INDEX IF NOT EXISTS idx_events_decision ON audit_events(decision)
    `);
  }

  private loadLastHash(): void {
    const result = this.db!.exec(
      'SELECT event_hash FROM audit_events ORDER BY rowid DESC LIMIT 1'
    );
    if (result.length > 0 && result[0].values.length > 0) {
      this.lastHash = result[0].values[0][0] as string;
    }
  }

  /**
   * Record an audit event with hash chain integrity.
   */
  async record(event: Omit<AuditEvent, 'id' | 'timestamp' | 'previousHash' | 'eventHash'>): Promise<AuditEvent> {
    if (!this.initialized || !this.db) {
      throw new Error('AuditLogger not initialized');
    }

    const id = generateEventId();
    const timestamp = nowISO();
    const previousHash = this.lastHash;

    // Create the canonical event string for hashing
    const hashInput = JSON.stringify({
      id,
      timestamp,
      previousHash,
      agentIdentity: event.agentIdentity,
      toolName: event.toolName,
      action: event.action,
      eventType: event.eventType,
      decision: event.decision ?? undefined,
    });
    const eventHash = sha256(hashInput);

    const fullEvent: AuditEvent = {
      ...event,
      id,
      timestamp,
      previousHash,
      eventHash,
    };

    // Persist to SQLite
    this.db.run(
      `INSERT INTO audit_events (
        id, timestamp, correlation_id, session_id, agent_identity,
        human_subject, tool_name, action, resource_id, event_type,
        decision, policy_id, risk_assessment, sanitized_args, outcome,
        delegation_id, parent_event_id, details, previous_hash, event_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fullEvent.id,
        fullEvent.timestamp,
        fullEvent.correlationId || null,
        fullEvent.sessionId || null,
        fullEvent.agentIdentity,
        fullEvent.humanSubject || null,
        fullEvent.toolName,
        fullEvent.action,
        fullEvent.resourceId || null,
        fullEvent.eventType,
        fullEvent.decision || null,
        fullEvent.policyId || null,
        fullEvent.riskAssessment ? JSON.stringify(fullEvent.riskAssessment) : null,
        fullEvent.sanitizedArgs ? JSON.stringify(fullEvent.sanitizedArgs) : null,
        fullEvent.outcome || null,
        fullEvent.delegationId || null,
        fullEvent.parentEventId || null,
        fullEvent.details ? JSON.stringify(fullEvent.details) : null,
        fullEvent.previousHash || null,
        fullEvent.eventHash || null,
      ]
    );

    this.lastHash = eventHash;
    this.persist();

    // Notify listeners (for SSE)
    for (const listener of this.listeners) {
      try {
        listener(fullEvent);
      } catch {
        // Don't let listener errors crash audit logging
      }
    }

    return fullEvent;
  }

  /**
   * Query events with filtering.
   */
  query(filters: {
    agentIdentity?: string;
    eventType?: string;
    decision?: string;
    toolName?: string;
    correlationId?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
    offset?: number;
  } = {}): AuditEvent[] {
    if (!this.db) return [];

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.agentIdentity) {
      conditions.push('agent_identity = ?');
      params.push(filters.agentIdentity);
    }
    if (filters.eventType) {
      conditions.push('event_type = ?');
      params.push(filters.eventType);
    }
    if (filters.decision) {
      conditions.push('decision = ?');
      params.push(filters.decision);
    }
    if (filters.toolName) {
      conditions.push('tool_name = ?');
      params.push(filters.toolName);
    }
    if (filters.correlationId) {
      conditions.push('correlation_id = ?');
      params.push(filters.correlationId);
    }
    if (filters.startTime) {
      conditions.push('timestamp >= ?');
      params.push(filters.startTime);
    }
    if (filters.endTime) {
      conditions.push('timestamp <= ?');
      params.push(filters.endTime);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    const sql = `SELECT * FROM audit_events ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const result = this.db.exec(sql, params as any[]);
    if (result.length === 0) return [];

    return result[0].values.map(row => this.rowToEvent(result[0].columns, row));
  }

  /**
   * Get event count by decision type.
   */
  getMetrics(): { total: number; allowed: number; denied: number; byType: Record<string, number> } {
    if (!this.db) return { total: 0, allowed: 0, denied: 0, byType: {} };

    const totalResult = this.db.exec('SELECT COUNT(*) FROM audit_events');
    const total = totalResult[0]?.values[0]?.[0] as number || 0;

    const allowedResult = this.db.exec("SELECT COUNT(*) FROM audit_events WHERE decision = 'ALLOW'");
    const allowed = allowedResult[0]?.values[0]?.[0] as number || 0;

    const deniedResult = this.db.exec("SELECT COUNT(*) FROM audit_events WHERE decision = 'DENY'");
    const denied = deniedResult[0]?.values[0]?.[0] as number || 0;

    const byTypeResult = this.db.exec('SELECT event_type, COUNT(*) as cnt FROM audit_events GROUP BY event_type');
    const byType: Record<string, number> = {};
    if (byTypeResult.length > 0) {
      for (const row of byTypeResult[0].values) {
        byType[row[0] as string] = row[1] as number;
      }
    }

    return { total, allowed, denied, byType };
  }

  /**
   * Get average authorization latency from recorded events.
   */
  getLatencyStats(): { avg: number; p50: number; p95: number; p99: number } {
    if (!this.db) return { avg: 0, p50: 0, p95: 0, p99: 0 };

    const result = this.db.exec(`
      SELECT json_extract(details, '$.evaluationTimeMs') as latency
      FROM audit_events
      WHERE details IS NOT NULL
        AND json_extract(details, '$.evaluationTimeMs') IS NOT NULL
      ORDER BY json_extract(details, '$.evaluationTimeMs')
    `);

    if (result.length === 0 || result[0].values.length === 0) {
      return { avg: 0, p50: 0, p95: 0, p99: 0 };
    }

    const latencies = result[0].values.map(r => Number(r[0])).filter(n => !isNaN(n)).sort((a, b) => a - b);
    if (latencies.length === 0) return { avg: 0, p50: 0, p95: 0, p99: 0 };

    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

    return { avg, p50, p95, p99 };
  }

  /**
   * Verify hash chain integrity.
   */
  verifyIntegrity(): { valid: boolean; brokenAt?: string; checkedCount: number } {
    if (!this.db) return { valid: false, brokenAt: 'DB not initialized', checkedCount: 0 };

    const result = this.db.exec(
      'SELECT id, timestamp, previous_hash, event_hash, agent_identity, tool_name, action, event_type, decision FROM audit_events ORDER BY rowid'
    );
    
    if (result.length === 0) return { valid: true, checkedCount: 0 };

    let previousHash = '0000000000000000000000000000000000000000000000000000000000000000';
    let checked = 0;

    for (const row of result[0].values) {
      const [id, timestamp, prevHash, storedHash, agentIdentity, toolName, action, eventType, decision] = row;

      if (prevHash !== previousHash) {
        return { valid: false, brokenAt: id as string, checkedCount: checked };
      }

      const hashInput = JSON.stringify({
        id,
        timestamp,
        previousHash: prevHash,
        agentIdentity,
        toolName,
        action,
        eventType,
        decision: decision ?? undefined,
      });
      const computedHash = sha256(hashInput);

      if (computedHash !== storedHash) {
        return { valid: false, brokenAt: id as string, checkedCount: checked };
      }

      previousHash = computedHash;
      checked++;
    }

    return { valid: true, checkedCount: checked };
  }

  /**
   * Get distinct agent identities.
   */
  getDistinctAgents(): string[] {
    if (!this.db) return [];
    const result = this.db.exec('SELECT DISTINCT agent_identity FROM audit_events');
    if (result.length === 0) return [];
    return result[0].values.map(r => r[0] as string);
  }

  /**
   * Add a listener for new events (used for SSE).
   */
  onEvent(listener: EventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Persist DB to disk.
   */
  private persist(): void {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      writeFileSync(this.dbPath, buffer);
    } catch {
      // Non-fatal: best-effort persistence
    }
  }

  /**
   * Get correlated events by correlation ID.
   */
  getCorrelatedEvents(correlationId: string): AuditEvent[] {
    return this.query({ correlationId, limit: 50 });
  }

  /**
   * Clear all events (for demo reset).
   */
  reset(): void {
    if (!this.db) return;
    this.db.run('DELETE FROM audit_events');
    this.lastHash = '0000000000000000000000000000000000000000000000000000000000000000';
    this.persist();
  }

  private rowToEvent(columns: string[], row: unknown[]): AuditEvent {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });

    return {
      id: obj['id'] as string,
      timestamp: obj['timestamp'] as string,
      correlationId: obj['correlation_id'] as string,
      sessionId: (obj['session_id'] as string) || undefined,
      agentIdentity: obj['agent_identity'] as string,
      humanSubject: (obj['human_subject'] as string) || undefined,
      toolName: obj['tool_name'] as string,
      action: obj['action'] as string,
      resourceId: (obj['resource_id'] as string) || undefined,
      eventType: obj['event_type'] as string as any,
      decision: (obj['decision'] as string as any) || undefined,
      policyId: (obj['policy_id'] as string) || undefined,
      riskAssessment: obj['risk_assessment'] ? JSON.parse(obj['risk_assessment'] as string) : undefined,
      sanitizedArgs: obj['sanitized_args'] ? JSON.parse(obj['sanitized_args'] as string) : undefined,
      outcome: (obj['outcome'] as string) || undefined,
      delegationId: (obj['delegation_id'] as string) || undefined,
      parentEventId: (obj['parent_event_id'] as string) || undefined,
      details: obj['details'] ? JSON.parse(obj['details'] as string) : undefined,
      previousHash: (obj['previous_hash'] as string) || undefined,
      eventHash: (obj['event_hash'] as string) || undefined,
    };
  }

  close(): void {
    if (this.db) {
      this.persist();
      this.db.close();
      this.db = null;
    }
  }
}

export default AuditLogger;
