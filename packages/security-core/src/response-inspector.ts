// ============================================================
// MCP Sentinel — Response Inspector
// Scans tool responses for secrets, prompt injection,
// schema violations, and suspicious content
// ============================================================

import type { InspectionFinding, ResponseInspectionResult, RiskLevel } from '@mcp-sentinel/shared';
import { SECRET_PATTERNS, INJECTION_PATTERNS } from '@mcp-sentinel/shared';

/**
 * Response inspection pipeline.
 * 
 * IMPORTANT LIMITATIONS:
 * - Pattern-based prompt injection detection cannot guarantee
 *   detection of every injection technique
 * - The primary protection is that even if an agent follows
 *   malicious instructions, subsequent tool calls are still
 *   subject to deterministic Cedar authorization
 * - Secret pattern matching uses known regex patterns; novel
 *   secret formats may not be detected
 */
export class ResponseInspector {
  /**
   * Inspect a tool response for security issues.
   */
  inspect(content: unknown): ResponseInspectionResult {
    const findings: InspectionFinding[] = [];
    const taintMarkers: string[] = [];
    let redactedContent = content;

    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);

    // 1. Secret pattern detection
    const secretFindings = this.detectSecrets(contentStr);
    findings.push(...secretFindings);
    if (secretFindings.length > 0) {
      taintMarkers.push('POSSIBLE_SECRET_EXPOSURE');
      redactedContent = this.redactSecrets(contentStr);
    }

    // 2. Prompt injection detection
    const injectionFindings = this.detectPromptInjection(contentStr);
    findings.push(...injectionFindings);
    if (injectionFindings.length > 0) {
      taintMarkers.push('SUSPICIOUS_INSTRUCTION');
    }

    // 3. External URL detection in suspicious content
    if (injectionFindings.length > 0) {
      const urlFindings = this.detectExternalUrls(contentStr);
      findings.push(...urlFindings);
      if (urlFindings.length > 0) {
        taintMarkers.push('UNTRUSTED_EXTERNAL_CONTENT');
      }
    }

    const blocked = findings.some(f => f.severity === ('CRITICAL' as RiskLevel));
    const blockReason = blocked
      ? findings.find(f => f.severity === ('CRITICAL' as RiskLevel))?.description
      : undefined;

    return {
      findings,
      redactedContent: secretFindings.length > 0 ? redactedContent : undefined,
      taintMarkers,
      blocked,
      blockReason,
    };
  }

  /**
   * Detect known secret patterns in content.
   */
  detectSecrets(content: string): InspectionFinding[] {
    const findings: InspectionFinding[] = [];

    for (const { name, pattern } of SECRET_PATTERNS) {
      // Create fresh regex (reset lastIndex)
      const regex = new RegExp(pattern.source, pattern.flags);
      const match = regex.exec(content);
      if (match) {
        findings.push({
          type: 'SECRET_DETECTED',
          severity: 'HIGH' as RiskLevel,
          description: `Potential ${name} detected in response`,
          evidence: match[0].slice(0, 20) + '...[redacted]',
          recommendation: 'Redact secret before returning to agent',
        });
      }
    }

    return findings;
  }

  /**
   * Detect prompt injection patterns in content.
   * 
   * NOTE: This is a supplemental signal. A regex scanner cannot
   * recognize every prompt injection. The primary defense is that
   * subsequent tool calls are still subject to Cedar authorization.
   */
  detectPromptInjection(content: string): InspectionFinding[] {
    const findings: InspectionFinding[] = [];

    for (const { name, pattern } of INJECTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      const match = regex.exec(content);
      if (match) {
        findings.push({
          type: 'PROMPT_INJECTION_DETECTED',
          severity: 'HIGH' as RiskLevel,
          description: `Suspicious instruction pattern '${name}' detected in tool response`,
          evidence: match[0].slice(0, 80),
          recommendation: 'Mark content as untrusted; enforce authorization on subsequent actions',
        });
      }
    }

    return findings;
  }

  /**
   * Detect external URLs mentioned in suspicious content.
   */
  detectExternalUrls(content: string): InspectionFinding[] {
    const findings: InspectionFinding[] = [];
    const urlPattern = /https?:\/\/[^\s"'<>]+/gi;
    let match;

    while ((match = urlPattern.exec(content)) !== null) {
      try {
        const url = new URL(match[0]);
        // Flag non-internal URLs
        if (!url.hostname.includes('demo.local') && !url.hostname.includes('localhost')) {
          findings.push({
            type: 'EXTERNAL_URL_IN_SUSPICIOUS_CONTENT',
            severity: 'MEDIUM' as RiskLevel,
            description: `External URL detected in suspicious content: ${url.hostname}`,
            evidence: match[0].slice(0, 60),
          });
        }
      } catch {
        // Not a valid URL
      }
    }

    return findings;
  }

  /**
   * Redact detected secrets from content.
   */
  redactSecrets(content: string): string {
    let redacted = content;
    for (const { pattern } of SECRET_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      redacted = redacted.replace(regex, '[REDACTED]');
    }
    return redacted;
  }
}

export default ResponseInspector;
