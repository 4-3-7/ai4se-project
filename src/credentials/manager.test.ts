import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CredentialManager } from './manager.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seahorse-cred-'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('CredentialManager', () => {
  // ── File-based store (for testing, keychain is OS-dependent) ──

  it('should store and retrieve a credential', async () => {
    const manager = new CredentialManager({ storeDir: tempDir, useKeychain: false });

    await manager.store('test-provider', 'sk-test-key-12345');

    const key = await manager.get('test-provider');
    expect(key).toBe('sk-test-key-12345');
  });

  it('should return null for non-existent credential', async () => {
    const manager = new CredentialManager({ storeDir: tempDir, useKeychain: false });

    const key = await manager.get('nonexistent');
    expect(key).toBeNull();
  });

  it('should list stored providers', async () => {
    const manager = new CredentialManager({ storeDir: tempDir, useKeychain: false });

    await manager.store('anthropic', 'sk-ant-key');
    await manager.store('openai', 'sk-openai-key');

    const providers = await manager.list();
    expect(providers).toContain('anthropic');
    expect(providers).toContain('openai');
  });

  it('should delete a credential', async () => {
    const manager = new CredentialManager({ storeDir: tempDir, useKeychain: false });

    await manager.store('anthropic', 'sk-ant-key');
    await manager.delete('anthropic');

    const key = await manager.get('anthropic');
    expect(key).toBeNull();
  });

  it('should return status without revealing the key', async () => {
    const manager = new CredentialManager({ storeDir: tempDir, useKeychain: false });

    await manager.store('anthropic', 'sk-ant-key-very-long-secret');

    const status = await manager.status();
    expect(status).toContain('anthropic');
    expect(status).toContain('configured');
    expect(status).not.toContain('sk-ant-key-very-long-secret');
  });

  it('should clear all credentials', async () => {
    const manager = new CredentialManager({ storeDir: tempDir, useKeychain: false });

    await manager.store('anthropic', 'sk-ant-key');
    await manager.store('openai', 'sk-openai-key');
    await manager.clear();

    const providers = await manager.list();
    expect(providers).toHaveLength(0);
  });
});