# MCP Sentinel

**Zero-Trust Agentic Sidecar (ZTAS) — Runtime security for MCP-connected AI agents**

> "Every sensitive tool call is evaluated against identity, capabilities, resource boundaries, authorization policy, and security context before the protected operation is allowed to execute."

## What It Does

MCP Sentinel is a **security proxy** that sits between AI agents and MCP tool servers. It intercepts every tool call and enforces:

- **Cedar policy authorization** — fine-grained, default-deny policies
- **Identity verification** — JWT tokens with SPIFFE-style subjects
- **Delegation attenuation** — child agents can never exceed parent permissions
- **Request inspection** — path traversal, SSRF, command injection detection
- **Response inspection** — secret redaction, prompt injection detection
- **Behavioral analysis** — correlated attack chain detection
- **Audit logging** — hash-chained event records with integrity verification

## Architecture

```
AI Agent → MCP Proxy (Security Layer) → Demo MCP Server
                ↓
    [Request Inspection → Identity → Cedar Auth → Response Inspection]
                ↓
         [Audit Logger → SQLite] ← API Server → Dashboard
```

## Quick Start

### ⚡ Windows 1-Click Launch (Recommended)

Simply double-click or run:
```cmd
start.bat
```
*(Or `run.bat`)*

This automatically:
1. Validates Node.js and dependencies
2. Launches the **API Server** on `http://localhost:3100` in its own window
3. Launches the **Vite Dashboard** on `http://localhost:5173` in its own window
4. Automatically opens the dashboard in your default browser
5. Provides an interactive menu to re-open or cleanly stop all servers via `stop.bat`

---

### Manual Launch

#### Prerequisites

- **Node.js** >= 20.x
- **npm** >= 10.x

#### Installation

```bash
git clone <repo>
cd mcp-sentinel
npm install
```

#### Start the API Server

```bash
npm run dev:api
```

API runs on `http://localhost:3100`

#### Start the Dashboard

```bash
npm run dev:dashboard
```

Dashboard runs on `http://localhost:5173`

### Run Attack Simulations

From the dashboard, navigate to **Attack Lab** and click **Run** on each scenario:

1. **Legitimate Refund** — $29.50 refund to ACC-1001 → ALLOWED
2. **Excessive Refund** — $500 refund → DENIED (exceeds $50 limit)
3. **Cross-Account** — Refund to ACC-1002 → DENIED (unauthorized account)
4. **Unauthorized Tool** — Read-only agent tries refund → DENIED (missing capability)
5. **Prompt Injection** — Malicious memo → injection detected → subsequent unauthorized action DENIED
6. **Token Revocation** — Token issued → call succeeds → token revoked → call DENIED

### Run Tests

```bash
npm test
```

### Run the MCP Proxy (stdio)

```bash
npm run dev:proxy
```

This starts the security proxy which spawns the demo MCP server as a child process and proxies all tool calls through the security layer.

## Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | Node.js | 25.x |
| Language | TypeScript | 5.x |
| MCP SDK | @modelcontextprotocol/sdk | 1.32.1 |
| Policy Engine | @cedar-policy/cedar-wasm | 4.13.0 |
| Backend | Express | 4.x |
| Frontend | React + Vite + TailwindCSS v4 | Latest |
| Database | sql.js (WASM SQLite) | Latest |
| JWT | jose (EdDSA) | 6.x |
| Testing | Vitest | 3.x |

## Project Structure

```
mcp-sentinel/
├── packages/
│   ├── shared/           # Types, constants, utilities
│   ├── policy-engine/    # Cedar WASM authorization
│   ├── identity/         # JWT tokens, delegation, revocation
│   ├── audit/            # SQLite audit with hash chain
│   └── security-core/    # Request/response inspection, risk scoring
├── apps/
│   ├── mcp-proxy/        # MCP security proxy (stdio)
│   ├── demo-mcp-server/  # Fintech demo tools
│   ├── api/              # Backend REST + SSE
│   └── dashboard/        # React security dashboard
├── policies/             # Cedar schema + policies
├── tests/                # Integration tests
└── docs/                 # Architecture, threat model, standards
```

## Key Security Properties

1. **Default-deny** — All tool calls are denied unless explicitly permitted by Cedar policy
2. **Fail-closed** — Authorization failures prevent tool execution
3. **Deterministic enforcement** — No LLM-based security decisions
4. **Monotonic delegation** — Child capabilities ⊆ parent capabilities
5. **Cascading revocation** — Revoking a parent invalidates all descendants
6. **Hash-chain audit** — Tamper-evident audit log with integrity verification
7. **Response inspection** — Secrets redacted before returning to agent

## Dashboard

The dashboard provides 7 views:

- **Overview** — Real-time metrics, latency percentiles, audit integrity
- **Live Monitor** — SSE-streamed event feed
- **Incidents** — Correlated attack chain explorer
- **Policies** — Cedar policy editor with validation
- **Identity** — Token management, delegation chains
- **Attack Lab** — Reproducible attack simulations
- **Audit** — Filterable event explorer with JSON export

## Known Limitations

See [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) for a candid assessment of what this prototype does and does not provide.

## License

MIT
