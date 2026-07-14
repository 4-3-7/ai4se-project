import { describe, it, expect } from 'vitest';
import { isPathAllowed, createSandbox, type SandboxConfig } from './sandbox.js';

const DEFAULT_CONFIG: SandboxConfig = {
  allowedPaths: ['/workspace'],
  deniedPaths: ['/etc', '/System', '/root/.ssh', '/root/.aws'],
  allowOutsideProject: false,
  maxFileSize: 10 * 1024 * 1024, // 10MB
};

describe('isPathAllowed', () => {
  // ── Allowed paths ──

  it('should allow paths within the project directory', () => {
    expect(isPathAllowed('/workspace/src/index.ts', DEFAULT_CONFIG)).toBe(true);
  });

  it('should allow paths in nested project directories', () => {
    expect(isPathAllowed('/workspace/src/core/llm/types.ts', DEFAULT_CONFIG)).toBe(true);
  });

  it('should allow the project root itself', () => {
    expect(isPathAllowed('/workspace', DEFAULT_CONFIG)).toBe(true);
  });

  // ── Denied paths ──

  it('should block access to /etc', () => {
    expect(isPathAllowed('/etc/passwd', DEFAULT_CONFIG)).toBe(false);
  });

  it('should block access to /etc subdirectories', () => {
    expect(isPathAllowed('/etc/nginx/nginx.conf', DEFAULT_CONFIG)).toBe(false);
  });

  it('should block access to /System', () => {
    expect(isPathAllowed('/System/Library/test', DEFAULT_CONFIG)).toBe(false);
  });

  it('should block access to .ssh directory', () => {
    expect(isPathAllowed('/root/.ssh/id_rsa', DEFAULT_CONFIG)).toBe(false);
  });

  it('should block access to .aws directory', () => {
    expect(isPathAllowed('/root/.aws/credentials', DEFAULT_CONFIG)).toBe(false);
  });

  // ── Outside project boundary ──

  it('should block paths outside allowedPaths when allowOutsideProject is false', () => {
    expect(isPathAllowed('/tmp/test.txt', DEFAULT_CONFIG)).toBe(false);
  });

  it('should block relative paths that escape the project', () => {
    // Paths that resolve outside the project
    expect(isPathAllowed('/workspace/../../../etc/passwd', DEFAULT_CONFIG)).toBe(false);
  });

  it('should allow outside paths when allowOutsideProject is true', () => {
    const config: SandboxConfig = { ...DEFAULT_CONFIG, allowOutsideProject: true };
    expect(isPathAllowed('/tmp/test.txt', config)).toBe(true);
  });

  // ── Denied paths take priority with allowOutsideProject ──

  it('should still block denied paths even when allowOutsideProject is true', () => {
    const config: SandboxConfig = { ...DEFAULT_CONFIG, allowOutsideProject: true };
    expect(isPathAllowed('/etc/passwd', config)).toBe(false);
  });

  // ── Multiple allowed paths ──

  it('should support multiple allowed paths', () => {
    const config: SandboxConfig = {
      ...DEFAULT_CONFIG,
      allowedPaths: ['/workspace', '/tmp/project2'],
    };
    expect(isPathAllowed('/workspace/src/a.ts', config)).toBe(true);
    expect(isPathAllowed('/tmp/project2/b.ts', config)).toBe(true);
    expect(isPathAllowed('/home/user/c.ts', config)).toBe(false);
  });

  // ── Edge cases ──

  it('should handle paths that are exactly the denied path', () => {
    expect(isPathAllowed('/etc', DEFAULT_CONFIG)).toBe(false);
  });

  it('should handle paths with trailing slashes', () => {
    expect(isPathAllowed('/etc/', DEFAULT_CONFIG)).toBe(false);
  });

  it('should allow the allowed path itself', () => {
    expect(isPathAllowed('/workspace', DEFAULT_CONFIG)).toBe(true);
  });
});

describe('createSandbox', () => {
  it('should create a sandbox with the given config', () => {
    const sandbox = createSandbox(DEFAULT_CONFIG);

    expect(sandbox.check('/workspace/src/file.ts')).toBe(true);
    expect(sandbox.check('/etc/passwd')).toBe(false);
  });

  it('should check file size against maxFileSize', () => {
    const sandbox = createSandbox({ ...DEFAULT_CONFIG, maxFileSize: 100 });

    expect(sandbox.checkSize(50)).toBe(true);
    expect(sandbox.checkSize(200)).toBe(false);
  });
});