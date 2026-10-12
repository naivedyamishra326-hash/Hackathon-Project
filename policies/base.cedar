// ============================================================
// MCP Sentinel — Base Cedar Policies
// In Cedar, the engine is default-deny by design (no permit = deny).
// Explicit forbid policies below enforce mandatory guardrails.
// ============================================================

// GUARDRAIL: Deny any request with a revoked token
@id("deny-revoked-tokens")
forbid (
  principal,
  action,
  resource
)
when {
  context has isRevoked && context.isRevoked == true
};
