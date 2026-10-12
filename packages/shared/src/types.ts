// ============================================================
// MCP Sentinel — Core Type Definitions
// ============================================================

/** Unique identifier for a tool invocation request */
export type CorrelationId = string;

/** SPIFFE-style identity URI */
export type AgentIdentity = string;

/** Cedar authorization decision */
export enum AuthzDecision {
  ALLOW = 'ALLOW',
  DENY = 'DENY',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
}

/** Risk severity levels */
export enum RiskLevel {
  NONE = 'NONE',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/** Security event types */
export enum SecurityEventType {
  TOOL_CALL_ALLOWED = 'TOOL_CALL_ALLOWED',
  TOOL_CALL_DENIED = 'TOOL_CALL_DENIED',
  TOOL_DISCOVERY = 'TOOL_DISCOVERY',
  SCHEMA_VALIDATION_FAILURE = 'SCHEMA_VALIDATION_FAILURE',
  PATH_TRAVERSAL_BLOCKED = 'PATH_TRAVERSAL_BLOCKED',
  SSRF_BLOCKED = 'SSRF_BLOCKED',
  COMMAND_INJECTION_BLOCKED = 'COMMAND_INJECTION_BLOCKED',
  SECRET_DETECTED = 'SECRET_DETECTED',
  PROMPT_INJECTION_DETECTED = 'PROMPT_INJECTION_DETECTED',
  RESPONSE_SCHEMA_VIOLATION = 'RESPONSE_SCHEMA_VIOLATION',
  TOKEN_ISSUED = 'TOKEN_ISSUED',
  TOKEN_REVOKED = 'TOKEN_REVOKED',
  TOKEN_REJECTED = 'TOKEN_REJECTED',
  DELEGATION_CREATED = 'DELEGATION_CREATED',
  DELEGATION_VIOLATION = 'DELEGATION_VIOLATION',
  CAPABILITY_VIOLATION = 'CAPABILITY_VIOLATION',
  POLICY_UPDATED = 'POLICY_UPDATED',
  POLICY_VALIDATION_ERROR = 'POLICY_VALIDATION_ERROR',
  BEHAVIORAL_ALERT = 'BEHAVIORAL_ALERT',
  INCIDENT_CREATED = 'INCIDENT_CREATED',
  CIRCUIT_BREAKER_TRIPPED = 'CIRCUIT_BREAKER_TRIPPED',
  CIRCUIT_BREAKER_RESET = 'CIRCUIT_BREAKER_RESET',
  APPROVAL_REQUESTED = 'APPROVAL_REQUESTED',
  APPROVAL_RESOLVED = 'APPROVAL_RESOLVED',
}

/** Defined capability set */
export enum Capability {
  LEDGER_READ = 'ledger.read',
  LEDGER_REFUND = 'ledger.refund',
  CUSTOMER_READ = 'customer.read',
  FILESYSTEM_READ = 'filesystem.read',
  FILESYSTEM_WRITE = 'filesystem.write',
  NETWORK_REQUEST = 'network.request',
  SHELL_EXECUTE = 'shell.execute',
}

/** Authorization request to Cedar */
export interface AuthzRequest {
  principal: string;
  action: string;
  resource: string;
  context: Record<string, unknown>;
}

/** Authorization result from Cedar */
export interface AuthzResult {
  decision: AuthzDecision;
  reasons: string[];
  diagnostics: string[];
  evaluationTimeMs: number;
}

/** Risk factor contributing to a risk score */
export interface RiskFactor {
  id: string;
  name: string;
  severity: RiskLevel;
  score: number;       // 0-100
  description: string;
  evidence?: string;
}

/** Composite risk assessment */
export interface RiskAssessment {
  overallScore: number; // 0-100
  level: RiskLevel;
  factors: RiskFactor[];
}

/** Audit event persisted to database */
export interface AuditEvent {
  id: string;
  timestamp: string;
  correlationId: CorrelationId;
  sessionId?: string;
  agentIdentity: AgentIdentity;
  humanSubject?: string;
  toolName: string;
  action: string;
  resourceId?: string;
  eventType: SecurityEventType;
  decision?: AuthzDecision;
  policyId?: string;
  riskAssessment?: RiskAssessment;
  sanitizedArgs?: Record<string, unknown>;
  outcome?: string;
  delegationId?: string;
  parentEventId?: string;
  details?: Record<string, unknown>;
  /** Hash of previous event for chain integrity */
  previousHash?: string;
  /** Hash of this event */
  eventHash?: string;
}

/** Token claims for demonstration identity */
export interface TokenClaims {
  /** Issuer */
  iss: string;
  /** Subject (SPIFFE URI) */
  sub: string;
  /** Audience */
  aud: string;
  /** Issued at (Unix seconds) */
  iat: number;
  /** Expiry (Unix seconds) */
  exp: number;
  /** JWT ID */
  jti: string;
  /** Current actor / agent identity */
  act?: { sub: string };
  /** Capabilities */
  capabilities: Capability[];
  /** Authorized resources */
  authorizedResources?: string[];
  /** Max refund amount */
  maxRefundAmount?: number;
  /** Currency code */
  currency?: string;
  /** Parent token ID for delegation */
  parentTokenId?: string;
}

/** Delegation record */
export interface DelegationRecord {
  id: string;
  parentTokenId: string;
  childTokenId: string;
  parentIdentity: AgentIdentity;
  childIdentity: AgentIdentity;
  parentCapabilities: Capability[];
  childCapabilities: Capability[];
  constraints: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
  revokedAt?: string;
}

/** Revocation entry */
export interface RevocationEntry {
  tokenId: string;
  revokedAt: string;
  reason: string;
  propagateToChildren: boolean;
}

/** Tool invocation record for the proxy */
export interface ToolInvocation {
  correlationId: CorrelationId;
  toolName: string;
  arguments: Record<string, unknown>;
  agentIdentity: AgentIdentity;
  tokenId?: string;
  sessionId?: string;
  timestamp: string;
}

/** Inspection finding from request or response */
export interface InspectionFinding {
  type: string;
  severity: RiskLevel;
  description: string;
  evidence?: string;
  recommendation?: string;
}

/** Response inspection result */
export interface ResponseInspectionResult {
  findings: InspectionFinding[];
  redactedContent?: unknown;
  taintMarkers: string[];
  blocked: boolean;
  blockReason?: string;
}

/** Demo fintech types */
export interface CustomerAccount {
  id: string;
  name: string;
  email: string;
  balance: number;
  currency: string;
  status: 'active' | 'suspended' | 'closed';
  createdAt: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  type: 'credit' | 'debit' | 'refund';
  amount: number;
  currency: string;
  memo: string;
  merchantName?: string;
  timestamp: string;
  status: 'completed' | 'pending' | 'refunded' | 'disputed';
  riskScore?: number;
}

export interface RefundRequest {
  transactionId: string;
  accountId: string;
  amount: number;
  currency: string;
  reason: string;
}

export interface RefundResult {
  success: boolean;
  refundId?: string;
  transactionId: string;
  accountId: string;
  amount: number;
  currency: string;
  newBalance?: number;
  message: string;
}

/** Dashboard API types */
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

/** Approval request for Human-in-the-Loop authorization */
export interface ApprovalRequest {
  id: string;
  correlationId: string;
  sessionId?: string;
  agentIdentity: string;
  toolName: string;
  action: string;
  resourceId?: string;
  requestedAmount?: number;
  currency?: string;
  args: Record<string, unknown>;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

/** Autonomous Circuit Breaker state */
export interface CircuitBreakerStatus {
  agentIdentity: string;
  state: 'NORMAL' | 'WARNING' | 'QUARANTINED';
  violationCount: number;
  threshold: number;
  lastViolationAt?: string;
  quarantinedAt?: string;
  reason?: string;
}

/** Executive compliance report */
export interface ComplianceReport {
  generatedAt: string;
  reportId: string;
  rootHash: string;
  chainIntegrity: boolean;
  totalEventsVerified: number;
  blockedThreatsCount: number;
  standards: {
    name: string;
    code: string;
    status: 'COMPLIANT' | 'ENFORCED';
    controls: { id: string; description: string; enforcementMechanism: string; status: string }[];
  }[];
}

/** SSE event for live updates */
export interface LiveSecurityEvent {
  type: 'audit_event' | 'metric_update' | 'incident' | 'policy_change' | 'approval_requested' | 'approval_resolved' | 'circuit_breaker';
  data: AuditEvent | SecurityMetrics | ApprovalRequest | CircuitBreakerStatus | Record<string, unknown>;
  timestamp: string;
}
