import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalSecureCredentialStore } from '../dist/index.js';

describe('LocalSecureCredentialStore', () => {
  it('should encrypt, retrieve, list, and delete credentials securely', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aioffice-creds-test-'));
    try {
      const store = new LocalSecureCredentialStore(tmp);

      // 1. Armazenar credencial
      await store.set('anthropic', 'sk-ant-api03-secretkey123456');

      // 2. Recuperar e verificar equivalência
      const retrieved = await store.get('anthropic');
      assert.equal(retrieved, 'sk-ant-api03-secretkey123456');

      // 3. Listar e verificar mascaramento
      const list = await store.list();
      assert.equal(list.length, 1);
      assert.equal(list[0]?.provider, 'anthropic');
      assert.equal(list[0]?.maskedValue, 'sk-...3456');

      // 4. Deletar
      const deleted = await store.delete('anthropic');
      assert.equal(deleted, true);

      const afterDelete = await store.get('anthropic');
      assert.equal(afterDelete, null);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
