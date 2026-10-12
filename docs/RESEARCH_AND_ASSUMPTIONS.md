# Research & Assumptions

## Major Technical Decisions

### 1. Cedar Policy Engine
- **Source**: [cedarpolicy.com](https://cedarpolicy.com), [@cedar-policy/cedar-wasm on npm](https://npmjs.com/package/@cedar-policy/cedar-wasm)
- **Requirement**: Authorization decisions must be deterministic, auditable, and based on structured policy
- **Chosen implementation**: `@cedar-policy/cedar-wasm@4.13.0` via `/nodejs` sub-package
- **Status**: Implemented and tested
- **Limitations**: Cedar schema validation may differ from policy parse validation; complex Cedar expressions have edge cases in WASM binding

### 2. MCP Protocol SDK
- **Source**: [modelcontextprotocol.io](https://modelcontextprotocol.io), [@modelcontextprotocol/sdk on npm](https://npmjs.com/package/@modelcontextprotocol/sdk)
- **Requirement**: Real MCP client/server interoperability via stdio transport
- **Chosen implementation**: `@modelcontextprotocol/sdk@1.32.1` (v1 maintenance line)
- **Status**: Implemented
- **Why v1 over v2**: v1 is stable and well-documented; v2 split packages were released mid-2026 and are too new for a complex integration project
- **Limitations**: Only stdio transport; Streamable HTTP not implemented

### 3. JWT Signing with EdDSA
- **Source**: RFC 7519 (JWT), RFC 8037 (EdDSA in JOSE)
- **Requirement**: Short-lived signed tokens with identity claims
- **Chosen implementation**: `jose` library with Ed25519 key pairs
- **Status**: Implemented and tested
- **Limitations**: Keys held in-memory; no HSM backing; no key rotation

### 4. SPIFFE Identity URIs
- **Source**: [spiffe.io](https://spiffe.io), SPIFFE specification
- **Requirement**: Agent identities in a structured, verifiable format
- **Chosen implementation**: SPIFFE URI format (`spiffe://demo.local/agent/<name>`) with local JWT issuer
- **Status**: Simulated for demonstration
- **Limitations**: No SPIRE workload attestation; identity is asserted, not attested

### 5. SQLite via sql.js
- **Source**: [sql.js on npm](https://npmjs.com/package/sql.js)
- **Requirement**: Persistent local audit storage without external services
- **Chosen implementation**: sql.js (SQLite compiled to WASM, pure JavaScript)
- **Why not better-sqlite3**: better-sqlite3 requires native compilation (node-gyp + Windows SDK); sql.js works without native dependencies
- **Status**: Implemented and tested
- **Limitations**: Synchronous API through WASM; no concurrent access from multiple processes (shared event file used instead)

### 6. OAuth 2.0 Token Exchange (RFC 8693)
- **Source**: RFC 8693
- **Requirement**: Delegation semantics for parent-to-child authorization
- **Chosen implementation**: Parent-child token binding with `parentTokenId` claim and capability subset enforcement
- **Status**: Partially implemented — semantics modeled, not a full Token Exchange endpoint
- **Important note**: RFC 8693 provides a mechanism for representing delegation. It does not automatically enforce capability attenuation. Attenuation is enforced by the application layer.

### 7. Response Inspection Patterns
- **Source**: OWASP LLM Top 10, academic prompt injection research
- **Requirement**: Detect suspicious content in tool responses
- **Chosen implementation**: Regex pattern matching for known secret formats and instruction patterns
- **Status**: Implemented as supplemental signal
- **Important note**: A regex scanner cannot guarantee detection of every prompt injection. The primary defense is deterministic Cedar authorization on subsequent tool calls.

## Unverified Claims

The following claims commonly appear in MCP security discussions but are NOT independently verified in this implementation:

1. "Cedar provides microsecond-latency authorization" — Cedar evaluation is fast, but the claim depends on policy complexity. Our benchmarks measure actual latency.
2. "SPIFFE/SPIRE provides zero-trust workload identity" — True in production; our local demo identity does not provide workload attestation.
3. "Hash-chained audit logs are tamper-proof" — A hash chain detects modification but does not prevent rewriting the entire store.
