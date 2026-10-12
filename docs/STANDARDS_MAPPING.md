# Standards Mapping

Maps each referenced standard/specification to its implementation status in MCP Sentinel.

| Standard | Aspect Used | Implementation Status | Notes |
|----------|-------------|----------------------|-------|
| **MCP Protocol** (modelcontextprotocol.io) | Tool discovery, tool invocation, stdio transport | ✅ Implemented and tested | Using `@modelcontextprotocol/sdk@1.32.1`; only stdio transport; resources/prompts not proxied |
| **Cedar Policy Language** (cedarpolicy.com) | Authorization decisions, schema validation | ✅ Implemented and tested | Using `@cedar-policy/cedar-wasm@4.13.0` via `/nodejs` sub-package; real WASM evaluation |
| **SPIFFE** (spiffe.io) | Agent identity URI format | ⚠️ Simulated | SPIFFE URI format used for agent identities; local issuer models the Workload API interface; no SPIRE attestation |
| **RFC 7519** (JWT) | Token format for authorization | ✅ Implemented and tested | Using `jose` library; EdDSA (Ed25519) signatures; proper issuer/audience/expiry verification |
| **RFC 8693** (Token Exchange) | Delegation semantics | ⚠️ Partially implemented | Delegation uses parent-child token binding and capability attenuation; not a full Token Exchange endpoint |
| **RFC 9396** (Rich Authorization Requests) | Structured authorization context | ⚠️ Design modeled | `authorization_details`-style context included in Cedar evaluation; not exposed as an RAR endpoint |
| **RFC 9449** (DPoP) | Proof of possession | ❌ Interface designed only | System uses signed bearer tokens; DPoP proof structure, request binding, and replay prevention not implemented |
| **OWASP LLM Top 10** | Excessive agency, prompt injection | ✅ Addressed | Deterministic capability enforcement; response inspection for injection indicators; authorization independent of model behavior |
| **JSON-RPC 2.0** | MCP transport protocol | ✅ Via MCP SDK | Handled by the official SDK transport layer |
| **Ed25519** (EdDSA) | Token signing | ✅ Implemented | Via `jose` library; key pair generated at startup; not backed by HSM |

### Status Legend

- ✅ **Implemented and tested** — Working code with automated tests
- ⚠️ **Partially implemented / Simulated** — Interface exists, some semantics modeled, production integration absent
- ❌ **Interface designed only** — Adapter boundary defined but integration not completed
