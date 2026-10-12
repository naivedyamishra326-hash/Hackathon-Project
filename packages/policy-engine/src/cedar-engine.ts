// ============================================================
// MCP Sentinel — Cedar Policy Engine
// Real Cedar WASM integration for authorization decisions
// ============================================================

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AuthzRequest, AuthzResult } from '@mcp-sentinel/shared';
import { AuthzDecision } from '@mcp-sentinel/shared';

// We'll dynamically load the cedar module
let cedarModule: any = null;

async function loadCedar(): Promise<any> {
  if (cedarModule) return cedarModule;
  try {
    cedarModule = await import('@cedar-policy/cedar-wasm/nodejs');
    return cedarModule;
  } catch (err) {
    throw new Error(`Failed to load Cedar WASM: ${err}`);
  }
}

export interface PolicyEngineConfig {
  policyDir: string;
  schemaFile?: string;
}

export interface PolicyFile {
  name: string;
  content: string;
  loadedAt: string;
}

/**
 * Cedar-based policy engine using official @cedar-policy/cedar-wasm.
 * All authorization decisions go through the real Cedar evaluator.
 * 
 * Cedar WASM v4 API shape:
 * - isAuthorized({ principal: {type, id}, action: {type, id}, resource: {type, id},
 *                  context: {}, policies: { staticPolicies, templates, templateLinks },
 *                  entities: [], schema: optional })
 * - policyToJson(text) — parse a single policy from text
 */
export class CedarPolicyEngine {
  private policies: PolicyFile[] = [];
  private policyText: string = '';
  private schemaText: string = '';
  private entities: unknown[] = [];
  private initialized: boolean = false;
  private config: PolicyEngineConfig;
  private lastGoodPolicyText: string = '';
  private lastGoodSchemaText: string = '';

  constructor(config: PolicyEngineConfig) {
    this.config = config;
  }

  /**
   * Initialize: load Cedar WASM, policies, schema.
   */
  async initialize(): Promise<void> {
    await loadCedar();
    await this.loadPolicies();
    this.initialized = true;
  }

  /**
   * Load all .cedar policy files from the configured directory.
   */
  async loadPolicies(): Promise<{ success: boolean; errors: string[] }> {
    const cedar = await loadCedar();
    const policyDir = resolve(this.config.policyDir);
    
    if (!existsSync(policyDir)) {
      return { success: false, errors: [`Policy directory not found: ${policyDir}`] };
    }

    const files = readdirSync(policyDir).filter(f => f.endsWith('.cedar'));
    const loadedPolicies: PolicyFile[] = [];
    let combinedText = '';

    for (const file of files) {
      const content = readFileSync(join(policyDir, file), 'utf-8');
      loadedPolicies.push({
        name: file,
        content,
        loadedAt: new Date().toISOString(),
      });
      combinedText += content + '\n';
    }

    // Load schema if available
    const schemaFile = this.config.schemaFile || join(policyDir, 'schema.cedarschema');
    let schema = '';
    if (existsSync(schemaFile)) {
      schema = readFileSync(schemaFile, 'utf-8');
    }

    // Validate by attempting a test authorization with a simple query
    // Cedar text policies go through policyToJson for individual parsing
    try {
      // Try a simple auth check to validate the policies can load
      const testResult = cedar.isAuthorized({
        principal: { type: 'MCPSentinel::Agent', id: 'test-validation' },
        action: { type: 'MCPSentinel::Action', id: 'test' },
        resource: { type: 'MCPSentinel::Tool', id: 'test' },
        context: {},
        policies: { staticPolicies: combinedText, templates: {}, templateLinks: [] },
        entities: [],
      });
      
      if (testResult.type === 'failure') {
        // Check if errors are real parse errors vs just no-match (which is fine)
        const parseErrors = testResult.errors?.filter((e: any) => 
          e.message && !e.message.includes('unrecognized entity type') && !e.message.includes('not declared')
        ) || [];
        if (parseErrors.length > 0) {
          return {
            success: false,
            errors: parseErrors.map((e: any) => e.message || String(e)),
          };
        }
      }
    } catch (err) {
      return {
        success: false,
        errors: [`Policy validation error: ${err}`],
      };
    }

    // Store as new active policies
    this.lastGoodPolicyText = this.policyText || combinedText;
    this.lastGoodSchemaText = this.schemaText || schema;
    this.policies = loadedPolicies;
    this.policyText = combinedText;
    this.schemaText = schema;

    return { success: true, errors: [] };
  }

  /**
   * Update entity store for authorization evaluation.
   */
  setEntities(entities: unknown[]): void {
    this.entities = entities;
  }

  /**
   * Parse Cedar entity reference string like 'MCPSentinel::Agent::"name"'
   * into { type: "MCPSentinel::Agent", id: "name" }.
   */
  private parseEntityRef(ref: string): { type: string; id: string } {
    // Pattern: Namespace::Type::"id"
    const match = ref.match(/^(.+)::"(.+)"$/);
    if (match) {
      return { type: match[1], id: match[2] };
    }
    // Fallback: just use it as-is
    return { type: 'Unknown', id: ref };
  }

  /**
   * Core authorization: evaluate a request against Cedar policies.
   * Returns a real Cedar decision.
   */
  async evaluate(request: AuthzRequest): Promise<AuthzResult> {
    if (!this.initialized) {
      return {
        decision: AuthzDecision.DENY,
        reasons: ['Policy engine not initialized'],
        diagnostics: ['FAIL_CLOSED: Engine not ready'],
        evaluationTimeMs: 0,
      };
    }

    const cedar = await loadCedar();
    const start = performance.now();

    try {
      // Parse entity references from string format to {type, id}
      const principal = this.parseEntityRef(request.principal);
      const action = this.parseEntityRef(request.action);
      const resource = this.parseEntityRef(request.resource);

      // Build the Cedar authorization call using v4 API shape
      const authCall = {
        principal,
        action,
        resource,
        context: request.context,
        policies: {
          staticPolicies: this.policyText,
          templates: {},
          templateLinks: [],
        },
        entities: this.entities,
      };

      // Call the real Cedar evaluator
      const result = cedar.isAuthorized(authCall);
      const elapsed = performance.now() - start;

      if (result.type === 'failure') {
        return {
          decision: AuthzDecision.DENY,
          reasons: ['Cedar evaluation failure'],
          diagnostics: (result.errors || []).map((e: any) => e.message || String(e)),
          evaluationTimeMs: elapsed,
        };
      }

      if (result.type === 'success') {
        const cedarDecision = result.response.decision === 'allow'
          ? AuthzDecision.ALLOW
          : AuthzDecision.DENY;

        return {
          decision: cedarDecision,
          reasons: result.response.diagnostics?.reason || [],
          diagnostics: result.response.diagnostics?.errors || [],
          evaluationTimeMs: elapsed,
        };
      }

      // Unknown result type
      return {
        decision: AuthzDecision.DENY,
        reasons: ['Unknown Cedar result type'],
        diagnostics: [JSON.stringify(result).slice(0, 200)],
        evaluationTimeMs: elapsed,
      };
    } catch (err) {
      const elapsed = performance.now() - start;
      return {
        decision: AuthzDecision.DENY,
        reasons: ['Cedar evaluation exception'],
        diagnostics: [String(err)],
        evaluationTimeMs: elapsed,
      };
    }
  }

  /**
   * Validate a policy string before applying.
   */
  async validatePolicy(policyText: string): Promise<{ valid: boolean; errors: string[] }> {
    const cedar = await loadCedar();
    try {
      // Try to parse each policy with policyToJson
      const result = cedar.policyToJson(policyText);
      if (result.type === 'failure' || result.type === 'error') {
        return { valid: false, errors: result.errors?.map((e: any) => e.message || String(e)) || ['Parse failed'] };
      }
      return { valid: true, errors: [] };
    } catch (err) {
      // Try as multi-policy set by doing a test authorization
      try {
        const testResult = cedar.isAuthorized({
          principal: { type: 'Test', id: 'test' },
          action: { type: 'Test', id: 'test' },
          resource: { type: 'Test', id: 'test' },
          context: {},
          policies: { staticPolicies: policyText, templates: {}, templateLinks: [] },
          entities: [],
        });
        // If it doesn't throw, the policies are parseable
        if (testResult.type === 'failure') {
          const realErrors = testResult.errors?.filter((e: any) => 
            e.message?.includes('parse') || e.message?.includes('syntax')
          ) || [];
          if (realErrors.length > 0) {
            return { valid: false, errors: realErrors.map((e: any) => e.message) };
          }
        }
        return { valid: true, errors: [] };
      } catch (e2) {
        return { valid: false, errors: [String(e2)] };
      }
    }
  }

  /**
   * Update a specific policy file, validate, and reload.
   */
  async updatePolicy(
    fileName: string,
    content: string
  ): Promise<{ success: boolean; errors: string[] }> {
    // First validate the new content
    const validation = await this.validatePolicy(content);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    // Rebuild combined policy text with the update
    const updated = this.policies.map(p => 
      p.name === fileName ? { ...p, content, loadedAt: new Date().toISOString() } : p
    );

    const combinedText = updated.map(p => p.content).join('\n');

    // Apply update
    this.lastGoodPolicyText = this.policyText;
    this.policies = updated;
    this.policyText = combinedText;

    // Also persist to disk
    const policyDir = resolve(this.config.policyDir);
    try {
      writeFileSync(join(policyDir, fileName), content, 'utf-8');
    } catch { /* best effort persist */ }

    return { success: true, errors: [] };
  }

  /**
   * Rollback to last known good policies.
   */
  rollback(): void {
    if (this.lastGoodPolicyText) {
      this.policyText = this.lastGoodPolicyText;
    }
    if (this.lastGoodSchemaText) {
      this.schemaText = this.lastGoodSchemaText;
    }
  }

  /**
   * Get current loaded policies.
   */
  getPolicies(): PolicyFile[] {
    return [...this.policies];
  }

  /**
   * Get policy text.
   */
  getPolicyText(): string {
    return this.policyText;
  }

  /**
   * Check if the engine is initialized and ready.
   */
  isReady(): boolean {
    return this.initialized;
  }
}

export default CedarPolicyEngine;
