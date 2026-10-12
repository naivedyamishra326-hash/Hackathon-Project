// ============================================================
// MCP Sentinel — Risk Scorer
// Transparent, configurable risk scoring with explicit factors
// ============================================================

import type { RiskAssessment, RiskFactor, RiskLevel, InspectionFinding } from '@mcp-sentinel/shared';
import { RISK_WEIGHTS } from '@mcp-sentinel/shared';

/**
 * Risk scoring module.
 * 
 * IMPORTANT: Risk scoring is an investigation and prioritization
 * mechanism. It does NOT replace Cedar authorization.
 * 
 * A low risk score NEVER overrides an explicit Cedar DENY.
 * 
 * Precedence order:
 * 1. Hard security violations (blocked)
 * 2. Cedar policy decisions (ALLOW/DENY)
 * 3. Approval requirements
 * 4. Supplemental behavioral risk
 * 5. Logging and monitoring
 */
export class RiskScorer {
  /**
   * Compute risk from inspection findings.
   */
  assess(findings: InspectionFinding[]): RiskAssessment {
    const factors: RiskFactor[] = [];

    for (const finding of findings) {
      const weight = this.getWeight(finding.type);
      factors.push({
        id: finding.type,
        name: finding.type.replace(/_/g, ' ').toLowerCase(),
        severity: finding.severity,
        score: weight,
        description: finding.description,
        evidence: finding.evidence,
      });
    }

    // Overall score: max of individual factors (not sum — prevents inflation)
    const overallScore = factors.length > 0
      ? Math.max(...factors.map(f => f.score))
      : 0;

    const level = this.scoreToLevel(overallScore);

    return { overallScore, level, factors };
  }

  /**
   * Get risk weight for a finding type.
   */
  private getWeight(findingType: string): number {
    switch (findingType) {
      case 'PATH_TRAVERSAL': return RISK_WEIGHTS.PATH_TRAVERSAL;
      case 'SSRF_BAD_SCHEME':
      case 'SSRF_METADATA':
      case 'SSRF_PRIVATE_IP':
      case 'SSRF_LOOPBACK': return RISK_WEIGHTS.SSRF_ATTEMPT;
      case 'COMMAND_INJECTION': return RISK_WEIGHTS.COMMAND_INJECTION;
      case 'SECRET_DETECTED': return RISK_WEIGHTS.SECRET_EXPOSURE;
      case 'PROMPT_INJECTION_DETECTED': return RISK_WEIGHTS.PROMPT_INJECTION;
      case 'SCHEMA_VIOLATION':
      case 'UNEXPECTED_FIELD': return RISK_WEIGHTS.SCHEMA_VIOLATION;
      case 'UNKNOWN_TOOL': return RISK_WEIGHTS.CAPABILITY_VIOLATION;
      case 'EXCESSIVE_DEPTH':
      case 'OVERSIZED_PAYLOAD': return 40;
      case 'EXTERNAL_URL_IN_SUSPICIOUS_CONTENT': return 55;
      default: return 30;
    }
  }

  private scoreToLevel(score: number): RiskLevel {
    if (score >= 80) return 'CRITICAL' as RiskLevel;
    if (score >= 60) return 'HIGH' as RiskLevel;
    if (score >= 40) return 'MEDIUM' as RiskLevel;
    if (score >= 20) return 'LOW' as RiskLevel;
    return 'NONE' as RiskLevel;
  }
}

export default RiskScorer;
