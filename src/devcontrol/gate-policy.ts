/**
 * Project Gate names are *requirements*, not MCP business test runners.
 * Existing built-in names remain readable for historical frozen plans.
 * Arbitrary scoped language/protocol test names are valid for planning.
 */
export const BUILTIN_GATES = new Set([
  'docs', 'sqlite_decision', 'go_contract', 'devcontrol_tests',
  'go_http_integration', 'go_postgres_live', 'flutter_test',
  'ios_device_e2e', 'v01_release_e2e',
]);
export function validGateName(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9_\-]{2,63}$/.test(value);
}
export function validGateRequirements(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 &&
    value.length <= 32 && value.every(validGateName) &&
    new Set(value).size === value.length;
}
export function isExternalGate(name: string): boolean {
  return validGateName(name) && !BUILTIN_GATES.has(name);
}
