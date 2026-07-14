/**
 * Danger patterns for the guardrail system.
 * Each pattern is a regex tested against shell_exec commands.
 * Corresponds to SPEC §3.5.1.
 */
export interface DangerPattern {
  name: string;
  regex: RegExp;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

export const DANGER_PATTERNS: DangerPattern[] = [
  // ── File system destruction ──
  {
    name: 'rm_root',
    regex: /\brm\s+-rf\s+(?:\/|~|\$HOME|\/\*)(?:\s|$)/,
    riskLevel: 'critical',
    description: 'Recursive deletion of root, home directory, or root filesystem.',
  },
  {
    name: 'mkfs',
    regex: /\bmkfs\.\w+/,
    riskLevel: 'critical',
    description: 'Filesystem formatting command.',
  },
  {
    name: 'dd_device',
    regex: /\bdd\s+.*\bof=\/dev\//,
    riskLevel: 'critical',
    description: 'Overwriting a block device with dd.',
  },

  // ── Database destruction ──
  {
    name: 'drop_table',
    regex: /\bDROP\s+TABLE\b/i,
    riskLevel: 'critical',
    description: 'Dropping a database table.',
  },
  {
    name: 'drop_database',
    regex: /\bDROP\s+DATABASE\b/i,
    riskLevel: 'critical',
    description: 'Dropping an entire database.',
  },
  {
    name: 'truncate',
    regex: /\bTRUNCATE\s+(TABLE\s+)?\w+/i,
    riskLevel: 'critical',
    description: 'Truncating a database table (removes all rows).',
  },
  {
    name: 'delete_without_where',
    regex: /\bDELETE\s+FROM\s+\w+\s*;/i,
    riskLevel: 'critical',
    description: 'DELETE FROM without WHERE clause (deletes all rows).',
  },

  // ── Permission changes ──
  {
    name: 'chmod_777',
    regex: /\bchmod\s+.*\b777\b/,
    riskLevel: 'high',
    description: 'Setting world-writable permissions (777).',
  },
  {
    name: 'chown_root',
    regex: /\bchown\s+root:/,
    riskLevel: 'high',
    description: 'Changing file ownership to root.',
  },

  // ── Network dangers ──
  {
    name: 'curl_pipe_bash',
    regex: /\bcurl\s+.*\|\s*(?:ba)?sh\b/,
    riskLevel: 'critical',
    description: 'Downloading and executing a remote script via curl.',
  },
  {
    name: 'wget_pipe_shell',
    regex: /\bwget\s+.*\|\s*(?:ba)?sh\b/,
    riskLevel: 'critical',
    description: 'Downloading and executing a remote script via wget.',
  },

  // ── System destruction ──
  {
    name: 'fork_bomb',
    regex: /:\(\)\s*\{[^}]*:\|:&[^}]*\}/,
    riskLevel: 'critical',
    description: 'Fork bomb pattern.',
  },
  {
    name: 'overwrite_system_file',
    regex: />\s*\/etc\/(?:passwd|shadow|group|sudoers)/,
    riskLevel: 'critical',
    description: 'Overwriting a critical system file.',
  },
];