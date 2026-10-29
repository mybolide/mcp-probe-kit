/** Gate IDs are stable acceptance requirement labels, NEVER executable tests.
 * Legacy IDs (docs, Go, Flutter, iOS) remain valid without runtime adapters.
 * sqlite_decision is the one internal structured-record condition.
 */
export function validGateName(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9_\-]{2,63}$/.test(value);
}
export function validGateRequirements(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 &&
    value.length <= 32 && value.every(validGateName) &&
    new Set(value).size === value.length;
}
export function isEvidenceGate(name: string): boolean {
  return validGateName(name) && name !== 'sqlite_decision';
}
