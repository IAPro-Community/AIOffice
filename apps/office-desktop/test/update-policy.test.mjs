import assert from 'node:assert/strict';
import test from 'node:test';
import { updateStrategy } from '../update-policy.mjs';

test('Windows updates use the official release installer and SHA-256 validation', () => {
  assert.deepEqual(updateStrategy({ packaged: true, platform: 'win32' }), { mode: 'github-installer', channel: 'latest' });
  assert.deepEqual(updateStrategy({ packaged: true, platform: 'win32', release: { signed: false } }), { mode: 'github-installer', channel: 'latest' });
});

test('unsigned macOS builds cannot install unverifiable updates', () => {
  assert.equal(updateStrategy({ packaged: true, platform: 'darwin' }).reason, 'unsigned-build');
});

test('signed macOS builds use the GitHub update feed and unsigned builds remain manual', () => {
  assert.deepEqual(updateStrategy({ packaged: true, platform: 'darwin', release: { signed: true } }), { mode: 'automatic', channel: 'latest' });
  assert.equal(updateStrategy({ packaged: true, platform: 'darwin', release: { signed: false } }).reason, 'unsigned-build');
});

test('Linux AppImage supports native updates while DEB follows the system package manager', () => {
  assert.deepEqual(updateStrategy({ packaged: true, platform: 'linux', env: { APPIMAGE: '/home/user/AIOffice.AppImage' } }), { mode: 'automatic', channel: 'latest' });
  assert.deepEqual(updateStrategy({ packaged: true, platform: 'linux' }), { mode: 'manual', channel: 'latest', reason: 'use-system-package-manager' });
});

test('development builds and an explicit opt-out never query release updates', () => {
  assert.equal(updateStrategy({ packaged: false, platform: 'win32' }).mode, 'disabled');
  assert.equal(updateStrategy({ packaged: true, platform: 'win32', env: { AIOFFICE_DISABLE_UPDATES: '1' }, release: { signed: true, windowsPublisherName: 'CN=AIOffice' } }).mode, 'disabled');
});
