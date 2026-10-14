import assert from 'node:assert/strict';
import { test } from 'node:test';
import electronUpdater from 'electron-updater';

test('electron-updater is loaded through its CommonJS-compatible ESM default export', () => {
  const autoUpdater = Object.getOwnPropertyDescriptor(electronUpdater, 'autoUpdater');
  assert.equal(typeof autoUpdater?.get, 'function');
});
