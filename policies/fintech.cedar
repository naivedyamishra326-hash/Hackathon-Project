// ============================================================
// MCP Sentinel — Fintech Demonstration Policies
// Fine-grained authorization for the remediation scenario
// ============================================================

// POLICY: Financial remediation agent can read approved accounts
@id("fin-remediation-read-accounts")
permit (
  principal == MCPSentinel::Agent::"spiffe://demo.local/agent/financial-remediation",
  action == MCPSentinel::Action::"read_account",
  resource
)
when {
  resource.status == "active"
};

// POLICY: Financial remediation agent can issue refunds
// ONLY to authorized account ACC-1001, max 50 units
@id("fin-remediation-refund-acc1001")
permit (
  principal == MCPSentinel::Agent::"spiffe://demo.local/agent/financial-remediation",
  action == MCPSentinel::Action::"issue_refund",
  resource == MCPSentinel::Account::"ACC-1001"
)
when {
  context.requestedAmount <= 5000 &&
  context.currency == "USD"
};

// POLICY: Financial remediation agent can call specific tools
@id("fin-remediation-allowed-tools")
permit (
  principal == MCPSentinel::Agent::"spiffe://demo.local/agent/financial-remediation",
  action == MCPSentinel::Action::"call_tool",
  resource
)
when {
  resource.category == "fintech" &&
  principal.capabilities.contains("ledger.read")
};

// POLICY: Financial remediation agent can call refund tools
@id("fin-remediation-refund-tools")
permit (
  principal == MCPSentinel::Agent::"spiffe://demo.local/agent/financial-remediation",
  action == MCPSentinel::Action::"call_tool",
  resource
)
when {
  resource.category == "fintech" &&
  principal.capabilities.contains("ledger.refund") &&
  context has requestedAmount &&
  context.requestedAmount <= 5000 &&
  context has targetAccountId &&
  principal.authorizedAccounts.contains(context.targetAccountId)
};

// POLICY: Read-only analyst can only read accounts and data
@id("analyst-read-only")
permit (
  principal == MCPSentinel::Agent::"spiffe://demo.local/agent/read-only-analyst",
  action == MCPSentinel::Action::"read_account",
  resource
)
when {
  resource.status == "active"
};

// POLICY: Read-only analyst can call read-only tools
@id("analyst-read-tools")
permit (
  principal == MCPSentinel::Agent::"spiffe://demo.local/agent/read-only-analyst",
  action == MCPSentinel::Action::"call_tool",
  resource
)
when {
  resource.category == "fintech" &&
  principal.capabilities.contains("ledger.read")
};

// POLICY: Refund reviewer can approve refunds but NOT execute them
@id("reviewer-read-accounts")
permit (
  principal == MCPSentinel::Agent::"spiffe://demo.local/agent/refund-reviewer",
  action == MCPSentinel::Action::"read_account",
  resource
)
when {
  resource.status == "active"
};

// POLICY: Deny all filesystem write operations for fintech agents
@id("deny-fintech-filesystem-write")
forbid (
  principal,
  action == MCPSentinel::Action::"write_resource",
  resource
);

// POLICY: Deny shell execution for all agents
@id("deny-shell-execution")
forbid (
  principal,
  action == MCPSentinel::Action::"execute_command",
  resource
);

// POLICY: Deny network requests for fintech agents
@id("deny-network-for-fintech")
forbid (
  principal,
  action == MCPSentinel::Action::"network_request",
  resource
);
