import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createDesktopUpdateManifests } from '../../../scripts/create-desktop-update-manifests.mjs';

test('creates architecture-aware macOS and Linux AppImage update manifests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aioffice-update-manifests-'));
  try {
    for (const asset of [
      'AIOffice-Setup-macOS-arm64.zip',
      'AIOffice-Setup-macOS-x64.zip',
      'AIOffice-Setup-Linux-x64.AppImage',
    ]) await writeFile(join(directory, asset), `contents:${asset}`);

    assert.deepEqual(await createDesktopUpdateManifests({
      assetsDirectory: directory,
      version: '2.3.0',
      releaseDate: '2026-10-14T12:00:00.000Z',
    }), ['latest-mac.yml', 'latest-linux.yml']);

    const mac = await readFile(join(directory, 'latest-mac.yml'), 'utf8');
    const linux = await readFile(join(directory, 'latest-linux.yml'), 'utf8');
    assert.match(mac, /version: 2\.3\.0/);
    assert.match(mac, /AIOffice-Setup-macOS-arm64\.zip/);
    assert.match(mac, /AIOffice-Setup-macOS-x64\.zip/);
    assert.equal((mac.match(/sha512:/g) || []).length, 3);
    assert.match(linux, /AIOffice-Setup-Linux-x64\.AppImage/);
    assert.match(linux, /releaseDate: "2026-10-14T12:00:00\.000Z"/);
    assert.equal((linux.match(/sha512:/g) || []).length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('fails closed when a required native update package is missing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aioffice-update-manifests-'));
  try {
    await assert.rejects(
      createDesktopUpdateManifests({ assetsDirectory: directory, version: '2.3.0' }),
      /ENOENT/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('creates a Linux-only update manifest while macOS packages are unavailable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aioffice-update-manifests-'));
  try {
    await writeFile(join(directory, 'AIOffice-Setup-Linux-x64.AppImage'), 'linux-appimage');
    assert.deepEqual(await createDesktopUpdateManifests({
      assetsDirectory: directory,
      version: '2.4.3',
      releaseDate: '2026-10-15T12:00:00.000Z',
      includeMac: false,
    }), ['latest-linux.yml']);
    const linux = await readFile(join(directory, 'latest-linux.yml'), 'utf8');
    assert.match(linux, /version: 2\.4\.3/);
    assert.match(linux, /AIOffice-Setup-Linux-x64\.AppImage/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
