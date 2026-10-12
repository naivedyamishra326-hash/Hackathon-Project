import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker } from '../src/circuit-breaker.js';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;
  const agent = 'spiffe://demo.local/agent/rogue';

  beforeEach(() => {
    cb = new CircuitBreaker({ violationThreshold: 3, windowMs: 10000 });
  });

  it('should start in NORMAL state with zero violations', () => {
    const status = cb.getStatus(agent);
    expect(status.state).toBe('NORMAL');
    expect(status.violationCount).toBe(0);
    expect(cb.isQuarantined(agent)).toBe(false);
  });

  it('should transition to WARNING on 1st and 2nd violation', () => {
    const v1 = cb.recordViolation(agent, 'Attempted path traversal');
    expect(v1.state).toBe('WARNING');
    expect(v1.tripped).toBe(false);
    expect(v1.violationCount).toBe(1);

    const v2 = cb.recordViolation(agent, 'Prompt injection detected');
    expect(v2.state).toBe('WARNING');
    expect(v2.tripped).toBe(false);
    expect(v2.violationCount).toBe(2);
  });

  it('should trip and QUARANTINE on 3rd violation', () => {
    cb.recordViolation(agent, 'Violation 1');
    cb.recordViolation(agent, 'Violation 2');
    const v3 = cb.recordViolation(agent, 'Violation 3');

    expect(v3.state).toBe('QUARANTINED');
    expect(v3.tripped).toBe(true);
    expect(cb.isQuarantined(agent)).toBe(true);

    const status = cb.getStatus(agent);
    expect(status.state).toBe('QUARANTINED');
    expect(status.quarantinedAt).toBeDefined();
  });

  it('should allow resetting quarantine state', () => {
    cb.recordViolation(agent, 'V1');
    cb.recordViolation(agent, 'V2');
    cb.recordViolation(agent, 'V3');
    expect(cb.isQuarantined(agent)).toBe(true);

    cb.reset(agent);
    expect(cb.isQuarantined(agent)).toBe(false);
    expect(cb.getStatus(agent).state).toBe('NORMAL');
  });
});
