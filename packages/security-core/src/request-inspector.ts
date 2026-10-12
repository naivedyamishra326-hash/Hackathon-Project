// ============================================================
// MCP Sentinel — Request Inspector
// Validates tool arguments, detects path traversal, SSRF,
// command injection, and other dangerous patterns
// ============================================================

import { resolve, normalize } from 'node:path';
import { URL } from 'node:url';
import type { InspectionFinding, RiskLevel } from '@mcp-sentinel/shared';
import { PROXY_CONFIG, BLOCKED_IP_RANGES, BLOCKED_METADATA_URLS, ALLOWED_URL_SCHEMES } from '@mcp-sentinel/shared';
import { ipInCIDR } from '@mcp-sentinel/shared';

export interface RequestInspectionResult {
  safe: boolean;
  findings: InspectionFinding[];
  blocked: boolean;
  blockReason?: string;
}

export interface ToolSchema {
  name: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Deterministic request inspection pipeline.
 * All checks are rule-based — no LLM dependency.
 */
export class RequestInspector {
  private workspaceBoundary: string;
  private allowedCommands: Set<string>;
  private allowedTools: Set<string>;

  constructor(config: {
    workspaceBoundary?: string;
    allowedCommands?: string[];
    allowedTools?: string[];
  } = {}) {
    this.workspaceBoundary = config.workspaceBoundary || '/workspace';
    this.allowedCommands = new Set(config.allowedCommands || []);
    this.allowedTools = new Set(config.allowedTools || []);
  }

  /**
   * Run all inspections against a tool invocation.
   */
  inspect(toolName: string, args: Record<string, unknown>, toolSchemas?: ToolSchema[]): RequestInspectionResult {
    const findings: InspectionFinding[] = [];

    // 1. Tool allowlist check
    if (this.allowedTools.size > 0 && !this.allowedTools.has(toolName)) {
      findings.push({
        type: 'UNKNOWN_TOOL',
        severity: 'HIGH' as RiskLevel,
        description: `Tool '${toolName}' is not in the allowed tool list`,
        recommendation: 'Only known, approved tools should be callable',
      });
      return { safe: false, findings, blocked: true, blockReason: `Unknown tool: ${toolName}` };
    }

    // 2. Payload size check
    const argsStr = JSON.stringify(args);
    if (argsStr.length > PROXY_CONFIG.MAX_PAYLOAD_BYTES) {
      findings.push({
        type: 'OVERSIZED_PAYLOAD',
        severity: 'MEDIUM' as RiskLevel,
        description: `Payload size ${argsStr.length} exceeds limit ${PROXY_CONFIG.MAX_PAYLOAD_BYTES}`,
      });
      return { safe: false, findings, blocked: true, blockReason: 'Payload too large' };
    }

    // 3. Schema validation
    if (toolSchemas) {
      const schema = toolSchemas.find(s => s.name === toolName);
      if (schema?.inputSchema) {
        const schemaFindings = this.validateSchema(args, schema.inputSchema);
        findings.push(...schemaFindings);
      }
    }

    // 4. Path traversal detection
    const pathFindings = this.checkPathTraversal(args);
    findings.push(...pathFindings);

    // 5. SSRF detection
    const ssrfFindings = this.checkSSRF(args);
    findings.push(...ssrfFindings);

    // 6. Command injection detection
    const cmdFindings = this.checkCommandInjection(args);
    findings.push(...cmdFindings);

    // 7. Argument depth check
    const depthFindings = this.checkArgDepth(args);
    findings.push(...depthFindings);

    const blocked = findings.some(f => f.severity === ('HIGH' as RiskLevel) || f.severity === ('CRITICAL' as RiskLevel));
    const blockReason = blocked ? findings.find(f => f.severity === ('HIGH' as RiskLevel) || f.severity === ('CRITICAL' as RiskLevel))?.description : undefined;

    return { safe: !blocked, findings, blocked, blockReason };
  }

  /**
   * Validate args against a JSON Schema-like definition.
   */
  private validateSchema(args: Record<string, unknown>, schema: { type: string; properties?: Record<string, unknown>; required?: string[] }): InspectionFinding[] {
    const findings: InspectionFinding[] = [];

    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in args)) {
          findings.push({
            type: 'SCHEMA_VIOLATION',
            severity: 'MEDIUM' as RiskLevel,
            description: `Missing required field: '${field}'`,
          });
        }
      }
    }

    if (schema.properties) {
      for (const key of Object.keys(args)) {
        if (!(key in schema.properties)) {
          findings.push({
            type: 'UNEXPECTED_FIELD',
            severity: 'LOW' as RiskLevel,
            description: `Unexpected field '${key}' not in schema`,
          });
        }
      }
    }

    return findings;
  }

  /**
   * Detect path traversal in any string-valued argument.
   * Uses proper path resolution — NOT just string matching.
   */
  checkPathTraversal(args: Record<string, unknown>): InspectionFinding[] {
    const findings: InspectionFinding[] = [];
    
    const checkValue = (key: string, value: unknown): void => {
      if (typeof value !== 'string') return;
      
      // Resolve the path and check if it escapes the boundary
      try {
        const normalized = normalize(value);
        const resolved = resolve(this.workspaceBoundary, normalized);
        
        if (!resolved.startsWith(normalize(this.workspaceBoundary))) {
          findings.push({
            type: 'PATH_TRAVERSAL',
            severity: 'CRITICAL' as RiskLevel,
            description: `Path traversal detected in '${key}': resolved path '${resolved}' escapes workspace boundary`,
            evidence: value,
            recommendation: 'Reject paths that resolve outside the allowed workspace',
          });
        }
      } catch {
        // Path resolve failure is suspicious
        if (value.includes('..') || value.includes('~')) {
          findings.push({
            type: 'PATH_TRAVERSAL',
            severity: 'HIGH' as RiskLevel,
            description: `Suspicious path characters in '${key}'`,
            evidence: value,
          });
        }
      }
    };

    this.walkArgs(args, checkValue);
    return findings;
  }

  /**
   * Detect SSRF attempts: blocked IPs, metadata endpoints, bad schemes.
   */
  checkSSRF(args: Record<string, unknown>): InspectionFinding[] {
    const findings: InspectionFinding[] = [];

    const checkValue = (key: string, value: unknown): void => {
      if (typeof value !== 'string') return;

      // Try to parse as URL
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        return; // Not a URL, skip
      }

      // Scheme check
      if (!ALLOWED_URL_SCHEMES.includes(url.protocol.replace(':', '') as any)) {
        findings.push({
          type: 'SSRF_BAD_SCHEME',
          severity: 'HIGH' as RiskLevel,
          description: `Disallowed URL scheme '${url.protocol}' in '${key}'`,
          evidence: value,
        });
      }

      // Metadata endpoint check
      const hostname = url.hostname.toLowerCase();
      if (BLOCKED_METADATA_URLS.includes(hostname as any)) {
        findings.push({
          type: 'SSRF_METADATA',
          severity: 'CRITICAL' as RiskLevel,
          description: `Cloud metadata endpoint detected in '${key}': ${hostname}`,
          evidence: value,
          recommendation: 'Block access to cloud metadata services',
        });
      }

      // Private IP check
      for (const cidr of BLOCKED_IP_RANGES) {
        if (ipInCIDR(hostname, cidr)) {
          findings.push({
            type: 'SSRF_PRIVATE_IP',
            severity: 'HIGH' as RiskLevel,
            description: `Private/internal IP detected in '${key}': ${hostname} matches ${cidr}`,
            evidence: value,
          });
          break;
        }
      }

      // Localhost variants
      if (hostname === 'localhost' || hostname === '[::1]' || hostname === '0.0.0.0') {
        findings.push({
          type: 'SSRF_LOOPBACK',
          severity: 'HIGH' as RiskLevel,
          description: `Loopback address detected in '${key}': ${hostname}`,
          evidence: value,
        });
      }
    };

    this.walkArgs(args, checkValue);
    return findings;
  }

  /**
   * Detect command injection patterns.
   */
  checkCommandInjection(args: Record<string, unknown>): InspectionFinding[] {
    const findings: InspectionFinding[] = [];
    
    const dangerousPatterns = [
      { pattern: /[;&|`$]/, name: 'Shell metacharacter' },
      { pattern: /\$\(/, name: 'Command substitution' },
      { pattern: /`[^`]+`/, name: 'Backtick execution' },
      { pattern: /\|\|/, name: 'OR operator' },
      { pattern: /&&/, name: 'AND operator' },
      { pattern: />\s*\//, name: 'Redirect to root' },
      { pattern: /\beval\b/, name: 'Eval keyword' },
      { pattern: /\bexec\b/, name: 'Exec keyword' },
    ];

    const checkValue = (key: string, value: unknown): void => {
      if (typeof value !== 'string') return;

      for (const { pattern, name } of dangerousPatterns) {
        if (pattern.test(value)) {
          findings.push({
            type: 'COMMAND_INJECTION',
            severity: 'CRITICAL' as RiskLevel,
            description: `${name} detected in '${key}'`,
            evidence: value.slice(0, 100),
            recommendation: 'Use explicit argument arrays; never pass strings through shell',
          });
        }
      }
    };

    this.walkArgs(args, checkValue);
    return findings;
  }

  /**
   * Check argument nesting depth to prevent DoS.
   */
  private checkArgDepth(args: Record<string, unknown>, maxDepth: number = PROXY_CONFIG.MAX_ARGS_DEPTH): InspectionFinding[] {
    const findings: InspectionFinding[] = [];
    
    const checkDepth = (obj: unknown, depth: number): void => {
      if (depth > maxDepth) {
        findings.push({
          type: 'EXCESSIVE_DEPTH',
          severity: 'MEDIUM' as RiskLevel,
          description: `Argument nesting depth ${depth} exceeds maximum ${maxDepth}`,
        });
        return;
      }
      if (typeof obj === 'object' && obj !== null) {
        for (const value of Object.values(obj)) {
          checkDepth(value, depth + 1);
        }
      }
    };

    checkDepth(args, 0);
    return findings;
  }

  /**
   * Walk all arguments recursively, calling the checker on each leaf.
   */
  private walkArgs(args: Record<string, unknown>, checker: (key: string, value: unknown) => void, prefix: string = ''): void {
    for (const [key, value] of Object.entries(args)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      checker(fullKey, value);
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        this.walkArgs(value as Record<string, unknown>, checker, fullKey);
      }
      if (Array.isArray(value)) {
        value.forEach((item, i) => {
          checker(`${fullKey}[${i}]`, item);
          if (typeof item === 'object' && item !== null) {
            this.walkArgs(item as Record<string, unknown>, checker, `${fullKey}[${i}]`);
          }
        });
      }
    }
  }

  /**
   * Update the allowed tools set.
   */
  setAllowedTools(tools: string[]): void {
    this.allowedTools = new Set(tools);
  }
}

export default RequestInspector;
