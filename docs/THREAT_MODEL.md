# Threat Model

## Scope

MCP Sentinel protects MCP tool invocations between AI agents and MCP servers. The enforcement boundary is the MCP security proxy.

## Threat Matrix

| # | Threat | Preconditions | Protected Asset | Mitigation | Tests | Residual Risk |
|---|--------|---------------|-----------------|------------|-------|---------------|
| 1 | **Direct prompt injection** | Attacker controls agent input | Agent behavior | Out of scope — Sentinel protects the tool layer, not the prompt layer | N/A | Agent may follow injected instructions, but tool calls are still subject to Cedar policy |
| 2 | **Indirect prompt injection** | Malicious content in tool response | Agent behavior, downstream tools | Response inspector detects suspicious patterns; subsequent tool calls still authorized | `security-core.test.ts` | Pattern-based detection cannot catch all injection variants |
| 3 | **Unauthorized tool invocation** | Agent attempts tool outside capability set | Protected tools | Cedar default-deny policy; capability verification | `security-core.test.ts` | Policy misconfiguration could create gaps |
| 4 | **Excessive refund** | Agent requests amount above limit | Financial ledger | Cedar policy with amount constraint; context-based authorization | Attack Lab simulation | Requires correct policy; amount encoding must be consistent |
| 5 | **Cross-account access** | Agent targets unauthorized account | Customer data | Cedar policy restricts authorized accounts; entity-level authorization | Attack Lab simulation | Requires correct entity store updates |
| 6 | **Path traversal** | Malicious file path in tool args | Filesystem | Proper path resolution + boundary check (not just `../` string matching) | `security-core.test.ts` | Symlink and TOCTOU edge cases |
| 7 | **Command injection** | Shell metacharacters in tool args | System commands | Pattern detection; no shell execution in demo | `security-core.test.ts` | Novel bypass techniques |
| 8 | **SSRF** | Internal URL in tool args | Internal network | IP range blocking, metadata endpoint blocking, scheme validation | `security-core.test.ts` | DNS rebinding, IPv6 edge cases |
| 9 | **Secret leakage** | Secrets in tool response | Credentials | Pattern-based detection + redaction before return to agent | `security-core.test.ts` | Novel secret formats |
| 10 | **Token theft/replay** | Attacker obtains bearer token | Authorization | Short TTL, signature verification, revocation checking | `identity.test.ts` | Replay within TTL window; no DPoP binding |
| 11 | **Expired authorization** | Token past expiry | Protected operations | JWT expiry verification via `jose` | `identity.test.ts` | Clock skew |
| 12 | **Revoked authorization** | Token or parent revoked | Protected operations | Revocation store checked on every request; cascading revocation | `identity.test.ts` | Local-only revocation |
| 13 | **Delegation escalation** | Child requests more than parent | Authorization boundary | Monotonic attenuation enforced: caps, resources, amounts | `identity.test.ts` | Requires correct parent verification |
| 14 | **Policy misconfiguration** | Overly permissive Cedar policy | Protected operations | Default-deny base; validation before activation; rollback on failure | Policy Studio | Cannot prevent human error in policy writing |
| 15 | **Audit log manipulation** | Attacker modifies audit DB | Audit integrity | Hash-chained events; integrity verification | `audit.test.ts` | Local DB + hash chain defeated by full rewrite |
| 16 | **Tool-name spoofing** | Downstream server advertises unexpected tools | Tool execution | Only registered tools are proxied; unknown tools rejected | Proxy implementation | Requires tool registry maintenance |
| 17 | **Denial of service** | Large payloads, deep nesting | System availability | Payload size limits, nesting depth limits, request timeouts | `security-core.test.ts` | Resource exhaustion at proxy level |
| 18 | **Proxy compromise** | Attacker compromises the proxy process | Everything | **Outside protection boundary** | N/A | If the proxy is compromised, all enforcement is defeated |

## Key Assumptions

1. The proxy process runs in a trusted environment
2. The signing key is not exposed
3. Cedar policies are written correctly
4. The SQLite database is protected by filesystem permissions
5. The downstream MCP server is honestly reporting its tools
