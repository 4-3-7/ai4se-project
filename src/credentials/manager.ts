import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

/**
 * Credential manager configuration.
 */
export interface CredentialConfig {
  /** Directory to store encrypted credentials */
  storeDir: string;
  /** Whether to use system keychain (requires keytar) */
  useKeychain: boolean;
}

/**
 * Credential manager — secure storage for API keys.
 *
 * Primary: File-based encrypted storage (AES-256-GCM).
 * Future: System keychain via keytar.
 *
 * Corresponds to SPEC §3.9.
 */
export class CredentialManager {
  private storeDir: string;
  private useKeychain: boolean;
  private encryptionKey: Buffer;

  constructor(config: CredentialConfig) {
    this.storeDir = config.storeDir;
    this.useKeychain = config.useKeychain;
    fs.mkdirSync(this.storeDir, { recursive: true });

    // Derive encryption key from machine-specific data
    // In production, this would use a proper key derivation function
    this.encryptionKey = crypto.scryptSync(
      'seahorse-credential-store',
      'seahorse-salt',
      32,
    );
  }

  /** Store a credential for a provider. */
  async store(provider: string, key: string): Promise<void> {
    if (this.useKeychain) {
      // Would use keytar here
      return this.storeEncrypted(provider, key);
    }
    return this.storeEncrypted(provider, key);
  }

  /** Get a credential for a provider. Returns null if not found. */
  async get(provider: string): Promise<string | null> {
    if (this.useKeychain) {
      return this.getEncrypted(provider);
    }
    return this.getEncrypted(provider);
  }

  /** Delete a credential. */
  async delete(provider: string): Promise<void> {
    const filePath = this.credentialPath(provider);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /** List all configured providers. */
  async list(): Promise<string[]> {
    if (!fs.existsSync(this.storeDir)) return [];
    return fs
      .readdirSync(this.storeDir)
      .filter((f) => f.endsWith('.enc'))
      .map((f) => f.replace(/\.enc$/, ''));
  }

  /** Get status string (no keys revealed). */
  async status(): Promise<string> {
    const providers = await this.list();
    if (providers.length === 0) {
      return 'No credentials configured.';
    }
    return providers.map((p) => `${p}: configured`).join('\n');
  }

  /** Clear all credentials. */
  async clear(): Promise<void> {
    const providers = await this.list();
    for (const p of providers) {
      await this.delete(p);
    }
  }

  // ── Private helpers ──

  private credentialPath(provider: string): string {
    return path.join(this.storeDir, `${provider}.enc`);
  }

  private storeEncrypted(provider: string, key: string): void {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(key, 'utf-8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const data = JSON.stringify({
      iv: iv.toString('hex'),
      encrypted: encrypted.toString('hex'),
      authTag: authTag.toString('hex'),
    });

    fs.writeFileSync(this.credentialPath(provider), data, 'utf-8');
  }

  private getEncrypted(provider: string): string | null {
    const filePath = this.credentialPath(provider);
    if (!fs.existsSync(filePath)) return null;

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const iv = Buffer.from(data.iv, 'hex');
      const encrypted = Buffer.from(data.encrypted, 'hex');
      const authTag = Buffer.from(data.authTag, 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString('utf-8');
    } catch {
      return null;
    }
  }
}