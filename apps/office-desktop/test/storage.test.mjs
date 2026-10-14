import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { desktopPaths, desktopServerCwd, preserveLegacyData, preserveLegacyEnv, serverEnvironment } from '../storage.mjs';

const temporary = [];
function temp() {
  const dir = mkdtempSync(join(tmpdir(), 'aioffice-desktop-'));
  temporary.push(dir);
  return dir;
}
test.after(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }); });

test('copies existing Habblaud data into OS app storage without moving the original', () => {
  const root = temp();
  const home = join(root, 'home');
  const legacy = join(home, '.habblaud');
  const paths = desktopPaths({ userDataDir: join(root, 'app-data', 'AIOffice'), homeDir: home });
  mkdirSync(legacy, { recursive: true });
  writeFileSync(join(legacy, 'names.json'), '{"room":"Oficina"}');
  assert.equal(preserveLegacyData(paths.dataDir, paths.legacyDataDirs), legacy);
  assert.equal(readFileSync(join(paths.dataDir, 'names.json'), 'utf8'), '{"room":"Oficina"}');
  assert.equal(readFileSync(join(legacy, 'names.json'), 'utf8'), '{"room":"Oficina"}');
});

test('never overwrites an existing desktop state or environment file', () => {
  const root = temp();
  const home = join(root, 'home');
  const old = join(home, '.habblaud');
  const userData = join(root, 'app-data', 'AIOffice');
  const paths = desktopPaths({ userDataDir: userData, homeDir: home, legacyAppEnv: join(root, 'legacy', '.env') });
  mkdirSync(old, { recursive: true });
  mkdirSync(paths.dataDir, { recursive: true });
  writeFileSync(join(old, 'names.json'), 'old');
  writeFileSync(join(paths.dataDir, 'names.json'), 'current');
  mkdirSync(join(root, 'legacy'));
  writeFileSync(paths.legacyEnvFiles[1], 'HABBLAUD_REMOTE_USER=alice\n');
  mkdirSync(paths.userData, { recursive: true });
  writeFileSync(paths.envFile, 'HABBLAUD_REMOTE_USER=bob\n');
  assert.equal(preserveLegacyData(paths.dataDir, paths.legacyDataDirs), undefined);
  assert.equal(preserveLegacyEnv(paths.envFile, paths.legacyEnvFiles), undefined);
  assert.equal(readFileSync(join(paths.dataDir, 'names.json'), 'utf8'), 'current');
  assert.equal(readFileSync(paths.envFile, 'utf8'), 'HABBLAUD_REMOTE_USER=bob\n');
});

test('desktop server binds locally, disables the legacy updater, and keeps data in userData', () => {
  const paths = desktopPaths({ userDataDir: 'C:/Users/example/AppData/Roaming/AIOffice', homeDir: 'C:/Users/example' });
  const env = serverEnvironment(paths, { HABBLAUD_HOST: '0.0.0.0', HABBLAUD_PORT: '4847' });
  assert.equal(env.HABBLAUD_HOST, '127.0.0.1');
  assert.equal(env.HABBLAUD_PORT, '4847');
  assert.equal(env.HABBLAUD_UPDATE_CHECK, '0');
  assert.equal(env.HABBLAUD_DATA_DIR, paths.dataDir);
  assert.equal(env.HABBLAUD_ENV_FILE, paths.envFile);
});

test('packaged server uses a real user directory instead of the app.asar path as cwd', () => {
  const root = temp();
  const home = join(root, 'home');
  const appPath = join(root, 'resources', 'app.asar');
  const paths = desktopPaths({ userDataDir: join(root, 'app-data'), homeDir: home });
  assert.equal(desktopServerCwd(paths, { packaged: true, appPath }), home);
  assert.equal(desktopServerCwd(paths, { packaged: false, appPath: root }), root);
});
