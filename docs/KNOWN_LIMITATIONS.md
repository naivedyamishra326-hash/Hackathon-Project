# Known Limitations

This document candidly describes what MCP Sentinel does and does not provide.

## What IS Implemented

- ✅ Real Cedar WASM policy evaluation (not JavaScript stubs)
- ✅ Real MCP SDK integration with stdio transport
- ✅ JWT-based identity with EdDSA signatures (via `jose`)
- ✅ Monotonic delegation attenuation with enforcement
- ✅ Cascading token revocation
- ✅ Deterministic request inspection (path traversal, SSRF, command injection)
- ✅ Pattern-based response inspection (secrets, prompt injection indicators)
- ✅ Hash-chained audit log with integrity verification
- ✅ Session-aware behavioral analysis
- ✅ Real-time SSE dashboard with backend data
- ✅ Reproducible attack simulations

## What IS NOT Implemented

### Identity & Authentication
- ❌ **SPIRE workload attestation** — The identity provider is a local demo issuer. It models the SPIFFE Workload API interface but does not perform real platform attestation.
- ❌ **Production OAuth 2.0 server** — Token exchange (RFC 8693) semantics are modeled but not backed by a full authorization server.
- ❌ **DPoP (RFC 9449)** — Interface designed but not implemented. The system uses signed bearer tokens, not DPoP-bound tokens.
- ❌ **Rich Authorization Requests (RFC 9396)** — Authorization context is structured but not exposed via a standards-compliant RAR endpoint.

### Security Guarantees
- ⚠️ **Prompt injection detection is pattern-based** — A regex scanner cannot guarantee detection of every injection technique. The primary defense is that subsequent tool calls remain subject to Cedar authorization.
- ⚠️ **Local hash chain ≠ immutable storage** — An attacker with write access to the database can rewrite the chain. Production deployment requires append-only storage.
- ⚠️ **In-process enforcement** — The proxy runs in the same trust domain as the agent. A compromised host defeats the enforcement boundary.
- ⚠️ **Local revocation only** — No distributed, globally synchronous revocation. Revocation propagation is immediate within the local process.

### Performance Claims
- ⚠️ Performance measurements reflect local single-process execution. No claims are made about distributed deployment latency.
- ⚠️ Cedar evaluation is fast, but end-to-end latency includes SQLite writes and response inspection.

### Compliance
- ❌ No regulatory compliance claims. Audit logging exists but does not satisfy SOC 2, HIPAA, or PCI-DSS requirements by itself.

### MCP Protocol Coverage
- ⚠️ Only stdio transport is supported. Streamable HTTP transport is not implemented.
- ⚠️ MCP resources and prompts are not proxied — only tool calls.
- ⚠️ Cancellation and progress notifications are passed through but not security-evaluated.

## Production Hardening Steps

1. Replace local identity issuer with SPIRE workload attestation
2. Add DPoP binding for token-to-request association
3. Implement distributed revocation (CRL or OCSP)
4. Deploy audit log to append-only storage (e.g., AWS QLDB, Azure Immutable Blob)
5. Add mutual TLS for proxy-to-server connections
6. Implement rate limiting and circuit breakers
7. Add formal Cedar policy testing with decision tables
8. Conduct security audit of the proxy implementation
9. Add Streamable HTTP transport support
10. Implement MCP resource and prompt proxying
