import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './loader.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seahorse-cfg-'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function writeConfig(name: string, content: string): string {
  const filePath = path.join(tempDir, name);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

describe('loadConfig', () => {
  it('should load a valid YAML config', () => {
    const filePath = writeConfig('seahorse.config.yaml', `
model:
  provider: anthropic
  model: claude-sonnet-5
  maxTokens: 8192
  temperature: 0.3

loop:
  maxTurns: 50
  maxContextTokens: 100000
  turnTimeout: 300000

governance:
  sandbox:
    allowedPaths: ["./"]
    deniedPaths: ["/etc", "~/.ssh"]
    allowOutsideProject: false
    maxFileSize: 10485760
  commands:
    deniedCommands: ["rm -rf", "chmod 777"]
    requireApproval: ["git push", "npm publish"]

rules:
  - "Always use 2-space indentation"
  - "Never use any type"
`);

    const config = loadConfig(filePath);

    expect(config.model.provider).toBe('anthropic');
    expect(config.model.model).toBe('claude-sonnet-5');
    expect(config.loop.maxTurns).toBe(50);
    expect(config.governance.sandbox.deniedPaths).toContain('/etc');
    expect(config.governance.commands.requireApproval).toContain('git push');
    expect(config.rules).toHaveLength(2);
  });

  it('should return defaults when config file does not exist', () => {
    const config = loadConfig(path.join(tempDir, 'nonexistent.yaml'));

    // Should have default values
    expect(config.model.provider).toBeDefined();
    expect(config.loop.maxTurns).toBeGreaterThan(0);
    expect(config.rules).toEqual([]);
  });

  it('should merge partial config with defaults', () => {
    const filePath = writeConfig('partial.yaml', `
model:
  provider: openai
rules:
  - "Use async/await"
`);

    const config = loadConfig(filePath);

    expect(config.model.provider).toBe('openai');
    // Default values should fill in the rest
    expect(config.model.model).toBeDefined();
    expect(config.loop.maxTurns).toBeGreaterThan(0);
    expect(config.rules).toContain('Use async/await');
  });

  it('should load JSON config', () => {
    const filePath = writeConfig('seahorse.config.json', JSON.stringify({
      model: { provider: 'openai', model: 'gpt-4o' },
      loop: { maxTurns: 25 },
    }));

    const config = loadConfig(filePath);

    expect(config.model.provider).toBe('openai');
    expect(config.loop.maxTurns).toBe(25);
  });
});