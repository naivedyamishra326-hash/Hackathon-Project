// ============================================================
// MCP Sentinel — Shared Constants
// ============================================================

/** Demo identity URIs */
export const DEMO_IDENTITIES = {
  FINANCIAL_REMEDIATION: 'spiffe://demo.local/agent/financial-remediation',
  READ_ONLY_ANALYST: 'spiffe://demo.local/agent/read-only-analyst',
  REFUND_REVIEWER: 'spiffe://demo.local/agent/refund-reviewer',
  UNKNOWN_AGENT: 'spiffe://demo.local/agent/unknown',
} as const;

/** Demo token issuer/audience */
export const TOKEN_CONFIG = {
  ISSUER: 'https://sentinel.demo.local/identity',
  AUDIENCE: 'https://sentinel.demo.local/mcp-proxy',
  DEFAULT_TTL_SECONDS: 300, // 5 minutes
  MAX_TTL_SECONDS: 3600,    // 1 hour
  ALGORITHM: 'EdDSA' as const,
} as const;

/** Cedar namespace constants */
export const CEDAR_CONFIG = {
  NAMESPACE: 'MCPSentinel',
  DEFAULT_POLICY_PATH: 'policies',
  SCHEMA_FILE: 'schema.cedarschema',
} as const;

/** API configuration */
export const API_CONFIG = {
  DEFAULT_PORT: 3100,
  SSE_PATH: '/api/events/stream',
  CORS_ORIGIN: 'http://localhost:5173',
} as const;

/** MCP proxy configuration */
export const PROXY_CONFIG = {
  REQUEST_TIMEOUT_MS: 30000,
  MAX_PAYLOAD_BYTES: 1_048_576, // 1MB
  MAX_ARGS_DEPTH: 10,
} as const;

/** Risk scoring weights */
export const RISK_WEIGHTS = {
  PATH_TRAVERSAL: 90,
  SSRF_ATTEMPT: 85,
  COMMAND_INJECTION: 95,
  INVALID_IDENTITY: 80,
  EXPIRED_TOKEN: 70,
  REVOKED_TOKEN: 85,
  CAPABILITY_VIOLATION: 75,
  SECRET_EXPOSURE: 80,
  PROMPT_INJECTION: 70,
  SCHEMA_VIOLATION: 50,
  EXCESSIVE_AMOUNT: 60,
  CROSS_ACCOUNT: 75,
  SUSPICIOUS_SEQUENCE: 65,
} as const;

/** Secret detection patterns (compiled at import time) */
export const SECRET_PATTERNS = [
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/g },
  { name: 'AWS Secret Key', pattern: /(?:aws_secret_access_key|secret_key)\s*[:=]\s*[A-Za-z0-9/+=]{40}/gi },
  { name: 'GitHub Token', pattern: /gh[ps]_[A-Za-z0-9_]{36,255}/g },
  { name: 'Generic API Key', pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']?[A-Za-z0-9\-_.]{20,}["']?/gi },
  { name: 'Bearer Token', pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g },
  { name: 'Private Key', pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g },
  { name: 'Password Field', pattern: /(?:password|passwd|pwd)\s*[:=]\s*["']?[^\s"']{8,}["']?/gi },
  { name: 'Connection String', pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^\s]+/gi },
] as const;

/** Prompt injection indicator patterns */
export const INJECTION_PATTERNS = [
  { name: 'IGNORE_INSTRUCTIONS', pattern: /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|directions|rules)/gi },
  { name: 'SYSTEM_OVERRIDE', pattern: /(?:system|admin)\s*(?:prompt|override|command)\s*:/gi },
  { name: 'ROLE_HIJACK', pattern: /you\s+are\s+now\s+(?:a|an)\s+/gi },
  { name: 'CREDENTIAL_REQUEST', pattern: /(?:send|transmit|exfiltrate|email|post)\s+(?:the\s+)?(?:credentials?|passwords?|keys?|tokens?|secrets?)\s+to/gi },
  { name: 'DATA_EXFIL', pattern: /(?:send|post|upload|transmit)\s+(?:all\s+)?(?:data|information|records|files)\s+to\s+(?:https?:\/\/|ftp:\/\/)/gi },
  { name: 'HIDDEN_INSTRUCTION', pattern: /\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>/g },
  { name: 'BASE64_COMMAND', pattern: /(?:execute|run|eval)\s+(?:the\s+)?(?:base64|encoded)\s+/gi },
] as const;

/** Allowed URL schemes for network requests */
export const ALLOWED_URL_SCHEMES = ['https', 'http'] as const;

/** Blocked IP ranges for SSRF protection */
export const BLOCKED_IP_RANGES = [
  '127.0.0.0/8',     // Loopback
  '10.0.0.0/8',      // Private Class A
  '172.16.0.0/12',   // Private Class B
  '192.168.0.0/16',  // Private Class C
  '169.254.0.0/16',  // Link-local
  '0.0.0.0/8',       // Current network
  '::1/128',         // IPv6 loopback
  'fc00::/7',        // IPv6 unique local
  'fe80::/10',       // IPv6 link-local
] as const;

/** Cloud metadata endpoints to block */
export const BLOCKED_METADATA_URLS = [
  '169.254.169.254',            // AWS/GCP metadata
  'metadata.google.internal',    // GCP
  '169.254.170.2',              // AWS ECS task metadata
  'fd00:ec2::254',              // AWS IPv6 metadata
] as const;
