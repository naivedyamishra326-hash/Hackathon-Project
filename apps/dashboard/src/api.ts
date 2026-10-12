const API_BASE = '/api';

export interface SecurityMetrics {
  totalInvocations: number;
  allowedRequests: number;
  blockedRequests: number;
  approvalRequired: number;
  distinctAgents: number;
  activeIncidents: number;
  recentViolations: number;
  avgAuthzLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  correlationId: string;
  sessionId?: string;
  agentIdentity: string;
  toolName: string;
  action: string;
  resourceId?: string;
  eventType: string;
  decision?: string;
  policyId?: string;
  riskAssessment?: { overallScore: number; level: string; factors: any[] };
  sanitizedArgs?: Record<string, unknown>;
  outcome?: string;
  details?: Record<string, unknown>;
  previousHash?: string;
  eventHash?: string;
}

export interface PolicyFile {
  name: string;
  content: string;
  loadedAt: string;
}

export interface DemoIdentity {
  name: string;
  uri: string;
  tokens: any[];
}

export interface Incident {
  id: string;
  sessionId: string;
  agentIdentity: string;
  severity: string;
  description: string;
  eventChain: { eventId: string; timestamp: string; toolName: string; eventType: string; decision?: string }[];
  detectedAt: string;
  status: string;
}

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  getHealth: () => fetchJSON<{ status: string; policyEngineReady: boolean }>('/health'),
  getMetrics: () => fetchJSON<SecurityMetrics>('/metrics'),
  getEvents: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchJSON<{ events: AuditEvent[] }>(`/events${qs}`);
  },
  getEvent: (id: string) => fetchJSON<AuditEvent>(`/events/${id}`),
  verifyIntegrity: () => fetchJSON<{ valid: boolean; brokenAt?: string; checkedCount: number }>('/audit/integrity'),
  getPolicies: () => fetchJSON<{ policies: PolicyFile[] }>('/policies'),
  updatePolicy: (filename: string, content: string) =>
    fetchJSON<{ success: boolean; errors?: string[] }>(`/policies/${filename}`, {
      method: 'PUT', body: JSON.stringify({ content }),
    }),
  validatePolicy: (content: string) =>
    fetchJSON<{ valid: boolean; errors: string[] }>('/policies/validate', {
      method: 'POST', body: JSON.stringify({ content }),
    }),
  generatePolicy: (prompt: string) =>
    fetchJSON<{ prompt: string; generatedPolicy: string; explanation: string; valid: boolean; errors?: string[] }>('/policies/generate', {
      method: 'POST', body: JSON.stringify({ prompt }),
    }),
  getIdentities: () => fetchJSON<{ identities: DemoIdentity[] }>('/identities'),
  issueToken: (params: any) => fetchJSON<any>('/tokens/issue', { method: 'POST', body: JSON.stringify(params) }),
  revokeToken: (tokenId: string, reason: string) =>
    fetchJSON<any>('/tokens/revoke', { method: 'POST', body: JSON.stringify({ tokenId, reason }) }),
  delegateToken: (params: any) => fetchJSON<any>('/tokens/delegate', { method: 'POST', body: JSON.stringify(params) }),
  getDelegations: () => fetchJSON<{ delegations: any[] }>('/delegations'),
  getRevocations: () => fetchJSON<{ revocations: any[] }>('/revocations'),
  getIncidents: () => fetchJSON<{ incidents: Incident[] }>('/incidents'),
  getApprovals: () => fetchJSON<{ approvals: any[] }>('/approvals'),
  decideApproval: (id: string, decision: 'approve' | 'reject', approvedBy?: string) =>
    fetchJSON<any>(`/approvals/${id}/decision`, {
      method: 'POST', body: JSON.stringify({ decision, approvedBy }),
    }),
  getCircuitBreaker: () => fetchJSON<{ statuses: any[] }>('/circuit-breaker'),
  resetCircuitBreaker: (agentIdentity?: string) =>
    fetchJSON<any>('/circuit-breaker/reset', {
      method: 'POST', body: JSON.stringify({ agentIdentity }),
    }),
  getComplianceReport: () => fetchJSON<any>('/reports/compliance'),
  simulate: (scenario: string) => fetchJSON<any>(`/simulate/${scenario}`, { method: 'POST' }),
  reset: () => fetchJSON<any>('/reset', { method: 'POST' }),
};

export function useSSE(onEvent: (event: any) => void) {
  const eventSourceRef = { current: null as EventSource | null };

  const connect = () => {
    const es = new EventSource(`${API_BASE}/events/stream`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        onEvent(data);
      } catch { /* skip */ }
    };
    es.onerror = () => {
      es.close();
      setTimeout(connect, 3000);
    };
    eventSourceRef.current = es;
  };

  const disconnect = () => {
    eventSourceRef.current?.close();
  };

  return { connect, disconnect };
}
