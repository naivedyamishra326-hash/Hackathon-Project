import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';

/**
 * Generate a correlation ID for request tracing.
 */
export function generateCorrelationId(): string {
  return `corr-${randomUUID()}`;
}

/**
 * Generate a unique event ID.
 */
export function generateEventId(): string {
  return `evt-${randomUUID()}`;
}

/**
 * Get current ISO timestamp.
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Compute SHA-256 hash of a string.
 */
export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Safely truncate a string for logging.
 */
export function truncate(str: string, maxLen: number = 200): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...[truncated]';
}

/**
 * Sanitize an object for audit logging — remove sensitive fields.
 */
export function sanitizeForAudit(
  obj: Record<string, unknown>,
  sensitiveKeys: string[] = ['password', 'token', 'secret', 'key', 'authorization', 'cookie']
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (sensitiveKeys.some(sk => k.toLowerCase().includes(sk))) {
      result[k] = '[REDACTED]';
    } else if (typeof v === 'string' && v.length > 500) {
      result[k] = truncate(v, 500);
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      result[k] = sanitizeForAudit(v as Record<string, unknown>, sensitiveKeys);
    } else {
      result[k] = v;
    }
  }
  return result;
}

/**
 * Check if a CIDR range contains an IP (simplified IPv4 check).
 */
export function ipInCIDR(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  if (!range || !bitsStr) return false;
  
  // Handle IPv6 separately (simplified)
  if (ip.includes(':') || range.includes(':')) {
    // Simplified: just check exact match for IPv6
    return ip === range || ip.startsWith(range.replace(/\/.*/, ''));
  }
  
  const bits = parseInt(bitsStr, 10);
  const ipParts = ip.split('.').map(Number);
  const rangeParts = range.split('.').map(Number);
  
  if (ipParts.length !== 4 || rangeParts.length !== 4) return false;
  
  const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const rangeNum = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];
  const mask = bits === 0 ? 0 : (~0 << (32 - bits));
  
  return (ipNum & mask) === (rangeNum & mask);
}

/**
 * Deep freeze an object (immutable).
 */
export function deepFreeze<T extends object>(obj: T): Readonly<T> {
  Object.freeze(obj);
  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
      deepFreeze(value as object);
    }
  }
  return obj;
}
