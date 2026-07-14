import * as path from 'node:path';

/**
 * Sandbox configuration.
 * Corresponds to SPEC §3.5.3.
 */
export interface SandboxConfig {
  /** Whitelist of allowed paths (absolute) */
  allowedPaths: string[];
  /** Blacklist of denied paths (absolute, checked first) */
  deniedPaths: string[];
  /** Whether to allow access outside allowedPaths */
  allowOutsideProject: boolean;
  /** Maximum file size for read/write operations */
  maxFileSize: number;
}

/**
 * Result of a sandbox path check.
 */
export interface SandboxResult {
  allowed: boolean;
  reason?: string;
}

/**
 * A sandbox instance that checks paths against configured boundaries.
 */
export interface Sandbox {
  /** Check if a path is allowed */
  check(filePath: string): boolean;
  /** Check if a file size is within limits */
  checkSize(size: number): boolean;
}

/**
 * Check if a file path is within the allowed boundaries.
 *
 * Rules:
 * 1. Denied paths always take priority (checked first)
 * 2. If allowOutsideProject is false, path must be within allowedPaths
 * 3. If allowOutsideProject is true, any path not in deniedPaths is allowed
 */
export function isPathAllowed(filePath: string, config: SandboxConfig): boolean {
  // Resolve to absolute path for consistent checking
  const resolved = path.resolve(filePath);

  // Rule 1: Denied paths take priority
  for (const denied of config.deniedPaths) {
    const resolvedDenied = path.resolve(denied);
    if (resolved === resolvedDenied || resolved.startsWith(resolvedDenied + path.sep)) {
      return false;
    }
  }

  // Rule 2: If outside is not allowed, check against allowedPaths
  if (!config.allowOutsideProject) {
    for (const allowed of config.allowedPaths) {
      const resolvedAllowed = path.resolve(allowed);
      if (resolved === resolvedAllowed || resolved.startsWith(resolvedAllowed + path.sep)) {
        return true;
      }
    }
    return false;
  }

  // Rule 3: allowOutsideProject = true, not denied → allowed
  return true;
}

/**
 * Create a sandbox instance from configuration.
 */
export function createSandbox(config: SandboxConfig): Sandbox {
  return {
    check(filePath: string): boolean {
      return isPathAllowed(filePath, config);
    },

    checkSize(size: number): boolean {
      return size <= config.maxFileSize;
    },
  };
}