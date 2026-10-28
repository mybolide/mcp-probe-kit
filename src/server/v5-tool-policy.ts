/**
 * Removed (not merely hidden in the compact set) in the v5 SQLite-only
 * development lifecycle. These handlers remain internal during the one-time
 * importer transition, but are no longer callable through MCP or CLI.
 */
export const V4_PROCESS_TOOLS = new Set([
  'start_feature', 'start_bugfix', 'start_ui', 'start_onboard',
  'start_product', 'start_ralph', 'workflow',
  'init_project', 'init_project_context', 'add_feature', 'check_spec',
  'plan_heartbeat', 'resume_plan', 'converge', 'interview', 'estimate',
]);

export function isV5Tool(name: string): boolean {
  return !V4_PROCESS_TOOLS.has(name);
}
