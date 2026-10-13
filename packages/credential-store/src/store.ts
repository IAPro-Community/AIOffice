import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import type { ICredentialStore, CredentialRecord } from './types.js';

interface StoredEncryptedEntry {
  readonly iv: string;
  readonly authTag: string;
  readonly encryptedData: string;
  readonly maskedValue: string;
  readonly updatedAt: string;
}

export class LocalSecureCredentialStore implements ICredentialStore {
  private readonly storagePath: string;
  private readonly masterKey: Buffer;

  constructor(customStoragePath?: string) {
    const dir = customStoragePath ? customStoragePath : join(homedir(), '.aioffice');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.storagePath = join(dir, 'credentials.enc.json');

    // Derivar chave local com base em identificador de máquina e usuário local
    const machineSalt = process.env['COMPUTERNAME'] || process.env['HOSTNAME'] || 'aioffice-local';
    const userSalt = process.env['USERNAME'] || process.env['USER'] || 'aioffice-user';
    this.masterKey = scryptSync(`${machineSalt}:${userSalt}`, 'aioffice-salt-2026', 32);
  }

  private loadStore(): Record<string, StoredEncryptedEntry> {
    if (!existsSync(this.storagePath)) {
      return {};
    }
    try {
      const raw = readFileSync(this.storagePath, 'utf-8');
      return JSON.parse(raw) as Record<string, StoredEncryptedEntry>;
    } catch {
      return {};
    }
  }

  private saveStore(store: Record<string, StoredEncryptedEntry>): void {
    writeFileSync(this.storagePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  private mask(secret: string): string {
    if (secret.length <= 8) return '****';
    const head = secret.slice(0, 3);
    const tail = secret.slice(-4);
    return `${head}...${tail}`;
  }

  public async set(provider: string, secret: string): Promise<void> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    let encrypted = cipher.update(secret, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    const store = this.loadStore();
    store[provider] = {
      iv: iv.toString('hex'),
      authTag,
      encryptedData: encrypted,
      maskedValue: this.mask(secret),
      updatedAt: new Date().toISOString(),
    };
    this.saveStore(store);
  }

  public async get(provider: string): Promise<string | null> {
    const store = this.loadStore();
    const entry = store[provider];
    if (!entry) return null;

    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.masterKey,
        Buffer.from(entry.iv, 'hex'),
      );
      decipher.setAuthTag(Buffer.from(entry.authTag, 'hex'));
      let decrypted = decipher.update(entry.encryptedData, 'hex', 'utf-8');
      decrypted += decipher.final('utf-8');
      return decrypted;
    } catch {
      return null;
    }
  }

  public async delete(provider: string): Promise<boolean> {
    const store = this.loadStore();
    if (!store[provider]) return false;
    delete store[provider];
    this.saveStore(store);
    return true;
  }

  public async list(): Promise<readonly CredentialRecord[]> {
    const store = this.loadStore();
    return Object.entries(store).map(([provider, entry]) => ({
      provider,
      maskedValue: entry.maskedValue,
      updatedAt: entry.updatedAt,
    }));
  }
}
