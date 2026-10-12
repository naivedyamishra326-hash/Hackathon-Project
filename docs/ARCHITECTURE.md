# Architecture

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        AI Agent / Test Client                 │
│                      (MCP Client, stdio)                      │
└─────────────────────────┬────────────────────────────────────┘
                          │ MCP Protocol (stdio)
┌─────────────────────────▼────────────────────────────────────┐
│                   MCP SECURITY PROXY                          │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐           │
│  │   Request    │ │  Identity   │ │    Cedar     │           │
│  │  Inspector   │→│  Verifier   │→│   Policy     │           │
│  │             │ │             │ │   Engine     │           │
│  │ • Schema    │ │ • JWT       │ │ • Default    │           │
│  │ • Path trav.│ │ • Expiry    │ │   deny       │           │
│  │ • SSRF      │ │ • Revocation│ │ • Resource   │           │
│  │ • Cmd inj.  │ │ • Delegation│ │   policies   │           │
│  └─────────────┘ └─────────────┘ └──────┬───────┘           │
│                                         │                     │
│                    ALLOW ───────────────▶│                     │
│                    DENY ──────────┐     │                     │
│                                  │     │                     │
│  ┌─────────────┐                 │     ▼                     │
│  │  Response   │◄────────────────┼── Downstream              │
│  │  Inspector  │                 │   Tool Call                │
│  │             │                 │                            │
│  │ • Secrets   │ ┌──────────┐   │                            │
│  │ • Injection │ │  Audit   │◄──┘                            │
│  │ • Redaction │ │  Logger  │                                │
│  └─────────────┘ │ (SQLite) │                                │
│                  └────┬─────┘                                │
└───────────────────────┼──────────────────────────────────────┘
                        │ Events (JSONL file)
┌───────────────────────▼──────────────────────────────────────┐
│                   API SERVER (Express)                         │
│                                                               │
│  • REST endpoints for dashboard                               │
│  • SSE for live event streaming                               │
│  • Policy management                                          │
│  • Identity & delegation management                           │
│  • Attack simulation orchestration                            │
└───────────────────────┬──────────────────────────────────────┘
                        │ HTTP + SSE
┌───────────────────────▼──────────────────────────────────────┐
│                   REACT DASHBOARD                             │
│                                                               │
│  Overview │ Live Monitor │ Incidents │ Policies │ Identity    │
│  Attack Lab │ Audit Explorer                                  │
└──────────────────────────────────────────────────────────────┘
```

## Authorization Flow

```
1. Tool call arrives at proxy
2. Request Inspector: validate schema, detect dangerous patterns
   → If dangerous pattern: BLOCK immediately
3. Identity Verifier: verify JWT signature, check expiry, check revocation
   → If invalid/expired/revoked: DENY
4. Cedar Policy Engine: evaluate (principal, action, resource, context)
   → If DENY: return error, DO NOT invoke downstream tool
   → If ALLOW: forward to downstream server
5. Response Inspector: scan response for secrets, injection patterns
   → Redact secrets, add taint markers
6. Audit Logger: record decision with hash chain
7. Return result to agent
```

## Cross-Process Event Sharing

The MCP proxy and API server run as separate processes. Events are shared via:
- **SQLite database**: Both processes read/write to the same DB file
- **JSONL event file**: Proxy appends events; API server polls for new lines

This is a pragmatic choice for the demo. Production would use a message queue or shared event bus.
