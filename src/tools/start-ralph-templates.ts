import type { RalphConfig } from './start-ralph-config.js';

export interface RalphGeneratedFiles {
  prompt: string;
  fixPlan: string;
  progress: string;
  safeScriptPath: string;
  safeScript: string;
  normalScriptPath: string;
  normalScript: string;
  guide: string;
}

export function generateRalphPrompt(config: RalphConfig, planId: string): string {
  return `# Ralph Bounded Development Prompt

## Goal

${config.goal}

## Completion Promise

${config.completionPromise}

## Managed Plan

- Plan ID: \`${planId}\`
- Project root: \`${config.projectRoot}\`
- Maximum rounds: ${config.maxIterations}
- Maximum wall time: ${config.maxMinutes} minutes
- Test command candidate: \`${config.testCommand}\`

## Per-Round Contract

For exactly one focused change per round:

1. Call \`resume_plan\` and use the ready round step.
2. Inspect the current repository and choose one bounded change.
3. Apply the change with the Agent's normal file tools.
4. Run the verified project test command and any affected checks.
5. Record Git revision/diff summary, changed-line count, command, exit code, test counts and unresolved items.
6. Call \`plan_heartbeat\` immediately with cumulative completed/skipped steps and runtime evidence.
7. Stop rather than continue when any safety condition is met.

Do not claim success from model text alone. The completion promise must be independently verified by real repository evidence and tests.

## Required Round Output

\`\`\`text
ROUND_STATUS: success | failed | stopped | blocked
COMPLETION_PROMISE_MET: true | false
EXIT_SIGNAL: true | false
SUMMARY: one-line factual summary
TEST_COMMAND: exact command
TEST_EXIT_CODE: integer
DIFF_LINES: integer
REVISION: git revision or explicit non-git marker
STOP_REASON: none | user_stop | timeout | max_rounds | repeated_output | diff_limit | repeated_failure | command_failure | blocked
NEXT_STEP: next bounded action or EXIT
\`\`\`

## Safety Rules

- Never run in the background or detach from the interactive terminal.
- Never exceed ${config.maxIterations} rounds or ${config.maxMinutes} minutes.
- Confirm with the user every ${config.confirmEvery} round(s); timeout after ${config.confirmTimeout} seconds.
- Stop if output repeats ${config.maxSameOutput} times.
- Stop if the cumulative unreviewed diff exceeds ${config.maxDiffLines} changed lines.
- After three failed repair attempts, return to analysis or mark the Plan blocked.
- A STOP file, user decline, timeout, command failure or safety limit is a stop, not successful convergence.
`;
}

export function generateRalphFixPlan(config: RalphConfig): string {
  return `# Ralph Task Plan

## Goal

${config.goal}

## Completion Promise

${config.completionPromise}

## Bounded Tasks

- [ ] Verify project instructions, repository state and test command
- [ ] Break the goal into small independently testable changes
- [ ] Execute at most ${config.maxIterations} rounds
- [ ] Run final tests and review the real diff
- [ ] Record final stop reason and convergence decision

## Discovered Work

Add newly discovered work here. Do not silently expand scope; defer unrelated work.
`;
}

export function generateRalphProgress(config: RalphConfig): string {
  return `# Ralph Progress

| Round | Status | Revision | Diff lines | Test command | Exit code | Summary | Next step |
|---:|---|---|---:|---|---:|---|---|
| 0 | initialized | - | 0 | ${config.testCommand} | - | Plan created | Verify baseline |

## Stop State

- Reason: not_started
- Completion promise verified: false
- Final convergence: pending

Each round must be appended only after real evidence is written through \`plan_heartbeat\`.
`;
}

function bashScript(config: RalphConfig, planId: string, normal: boolean): string {
  const confirmation = normal ? Math.max(config.confirmEvery, 2) : config.confirmEvery;
  return `#!/usr/bin/env bash
set -euo pipefail

MAX_ITERS=\${MAX_ITERS:-${config.maxIterations}}
MAX_MINUTES=\${MAX_MINUTES:-${config.maxMinutes}}
CONFIRM_EVERY=\${CONFIRM_EVERY:-${confirmation}}
CONFIRM_TIMEOUT=\${CONFIRM_TIMEOUT:-${config.confirmTimeout}}
COOLDOWN_SECONDS=\${COOLDOWN_SECONDS:-${config.cooldownSeconds}}
CLI_COMMAND=\${CLI_COMMAND:-${config.cliCommand}}
PLAN_ID="${planId}"

if [[ ! -t 0 ]]; then
  echo "Refusing to run without an interactive foreground terminal."
  exit 2
fi
if [[ ! -f PROMPT.md ]]; then
  echo "PROMPT.md not found; run this script from .ralph/."
  exit 2
fi

START_SECONDS=$(date +%s)
for ((ROUND=1; ROUND<=MAX_ITERS; ROUND++)); do
  [[ -f STOP ]] && { echo "STOP file detected."; exit 3; }
  NOW=$(date +%s)
  (( (NOW - START_SECONDS) / 60 >= MAX_MINUTES )) && { echo "Maximum time reached."; exit 4; }

  if (( ROUND % CONFIRM_EVERY == 0 )); then
    printf 'Continue round %s/%s for plan %s? [y/N]: ' "$ROUND" "$MAX_ITERS" "$PLAN_ID"
    if ! read -r -t "$CONFIRM_TIMEOUT" REPLY || [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
      echo "Stopped by confirmation policy."
      exit 5
    fi
  fi

  echo "Running foreground round $ROUND/$MAX_ITERS"
  "$CLI_COMMAND" @PROMPT.md | tee "last_output_$ROUND.txt"
  if grep -q "COMPLETION_PROMISE_MET: true" "last_output_$ROUND.txt" \
    && grep -q "EXIT_SIGNAL: true" "last_output_$ROUND.txt"; then
    echo "Agent requested exit; independently verify final evidence before converge."
    exit 0
  fi
  sleep "$COOLDOWN_SECONDS"
done

echo "Maximum rounds reached; this is a safety stop, not automatic success."
exit 6
`;
}

function powershellScript(config: RalphConfig, planId: string): string {
  return `# Ralph bounded foreground helper
$ErrorActionPreference = "Stop"
$MaxIters = if ($env:MAX_ITERS) { [int]$env:MAX_ITERS } else { ${config.maxIterations} }
$MaxMinutes = if ($env:MAX_MINUTES) { [int]$env:MAX_MINUTES } else { ${config.maxMinutes} }
$ConfirmEvery = if ($env:CONFIRM_EVERY) { [int]$env:CONFIRM_EVERY } else { ${config.confirmEvery} }
$CliCommand = if ($env:CLI_COMMAND) { $env:CLI_COMMAND } else { "${config.cliCommand}" }
$PlanId = "${planId}"

if (-not [Environment]::UserInteractive) { throw "Interactive foreground session required" }
if (-not (Test-Path "PROMPT.md")) { throw "PROMPT.md not found; run from .ralph" }

$Started = Get-Date
for ($Round = 1; $Round -le $MaxIters; $Round++) {
  if (Test-Path "STOP") { Write-Host "STOP file detected"; exit 3 }
  if (((Get-Date) - $Started).TotalMinutes -ge $MaxMinutes) { Write-Host "Maximum time reached"; exit 4 }
  if ($Round % $ConfirmEvery -eq 0) {
    $Reply = Read-Host "Continue round $Round/$MaxIters for plan $PlanId? [y/N]"
    if ($Reply -notmatch '^[Yy]$') { Write-Host "Stopped by user"; exit 5 }
  }
  Write-Host "Running foreground round $Round/$MaxIters"
  & $CliCommand "@PROMPT.md" | Tee-Object -FilePath "last_output_$Round.txt"
  $Content = Get-Content "last_output_$Round.txt" -Raw
  if ($Content -match 'COMPLETION_PROMISE_MET: true' -and $Content -match 'EXIT_SIGNAL: true') {
    Write-Host "Agent requested exit; independently verify final evidence before converge"
    exit 0
  }
  Start-Sleep -Seconds ${config.cooldownSeconds}
}
Write-Host "Maximum rounds reached; this is not automatic success"
exit 6
`;
}

export function generateRalphFiles(config: RalphConfig, planId: string): RalphGeneratedFiles {
  const safeScriptPath = config.isWindows
    ? '.ralph/ralph_loop_safe.ps1'
    : '.ralph/ralph_loop_safe.sh';
  return {
    prompt: generateRalphPrompt(config, planId),
    fixPlan: generateRalphFixPlan(config),
    progress: generateRalphProgress(config),
    safeScriptPath,
    safeScript: config.isWindows
      ? powershellScript(config, planId)
      : bashScript(config, planId, false),
    normalScriptPath: '.ralph/ralph_loop_normal.sh',
    normalScript: bashScript(config, planId, true),
    guide: `# Ralph Bounded Loop Setup

| Parameter | Value |
|---|---:|
| Mode | ${config.mode} |
| Max Iterations | ${config.maxIterations} |
| Max Minutes | ${config.maxMinutes} |
| Confirm Every | ${config.confirmEvery} |
| Confirmation Timeout | ${config.confirmTimeout}s |
| Max Same Output | ${config.maxSameOutput} |
| Max Diff Lines | ${config.maxDiffLines} |
| Cooldown | ${config.cooldownSeconds}s |

The generated script is an optional foreground helper. \`start_ralph\` does not execute it, create a background process or claim any round completed. The Agent remains responsible for executing the formal Plan, writing a Heartbeat after every round, and running final verification before Converge.
`,
  };
}
