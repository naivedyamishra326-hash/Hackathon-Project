# Demo Script (3-minute judging walkthrough)

## Setup

```bash
# Terminal 1: API Server
npm run dev:api

# Terminal 2: Dashboard
npm run dev:dashboard
```

Open `http://localhost:5173` in your browser.

---

## Minute 1: Legitimate Operation + Policy Enforcement

### Step 1: Run Legitimate Refund
- Navigate to **Attack Lab**
- Click **Run** on "Legitimate Refund"
- **Expected**: Event shows ALLOW, policy `fin-remediation-refund-acc1001`
- **Dashboard**: Overview metrics update, event appears in Live Monitor

### Step 2: Run Excessive Refund
- Click **Run** on "Excessive Refund"
- **Expected**: Event shows DENY — $500 exceeds $50 limit
- **Verification**: Ledger unchanged (refund never executed)

### Step 3: Run Cross-Account Access
- Click **Run** on "Cross-Account Access"
- **Expected**: Event shows DENY — ACC-1002 not authorized
- **Verification**: Only ACC-1001 is in the agent's authorized resources

---

## Minute 2: Attack Detection + Response Inspection

### Step 4: Run Prompt Injection
- Click **Run** on "Prompt Injection"
- **Expected**: Two events generated:
  1. `PROMPT_INJECTION_DETECTED` — Malicious memo identified
  2. `TOOL_CALL_DENIED` — Subsequent unauthorized refund blocked by Cedar
- **Dashboard**: Navigate to **Incidents** — attack chain visible
- **Key Point**: Even if the agent follows the injected instructions, Cedar denies the unauthorized operation

### Step 5: Run Unauthorized Tool
- Click **Run** on "Unauthorized Tool"
- **Expected**: Read-only analyst lacks `ledger.refund` capability → DENIED

---

## Minute 3: Identity + Delegation + Audit

### Step 6: Run Token Revocation
- Click **Run** on "Token Revocation"
- **Expected**: Three events:
  1. Pre-revocation call → ALLOWED
  2. Token revoked
  3. Post-revocation call → DENIED
- **Key Point**: Same operation, same agent, different authorization state

### Step 7: Inspect Policies
- Navigate to **Policies**
- View Cedar policy files: `base.cedar` (default deny), `fintech.cedar` (fine-grained rules)
- Click **Validate** — policy validation via real Cedar WASM

### Step 8: Verify Audit Integrity
- Navigate to **Overview**
- Check "Audit Chain Integrity" card → shows "Chain Valid" with event count
- Navigate to **Audit** → filter by DENY → export JSON

---

## Key Talking Points

1. **Every decision is a real Cedar evaluation** — not JavaScript stubs
2. **The proxy fails closed** — unknown tools, missing identity, and policy failures all deny
3. **Delegation cannot escalate** — child capabilities ⊆ parent capabilities
4. **Prompt injection detection is supplemental** — the primary protection is that tool authorization is deterministic
5. **All dashboard data comes from the backend** — no fake metrics or random numbers
