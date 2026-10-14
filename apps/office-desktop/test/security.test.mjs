import assert from 'node:assert/strict';
import test from 'node:test';
import { externalUrl, isAllowedAppNavigation, isTrustedServerReady, validateDesktopRequest } from '../security.mjs';

const appUrl = 'http://127.0.0.1:4747';

test('only the exact local application origin can navigate inside the window', () => {
  assert.equal(isAllowedAppNavigation('http://127.0.0.1:4747/settings', appUrl), true);
  assert.equal(isAllowedAppNavigation('http://localhost:4747/settings', appUrl), false);
  assert.equal(isAllowedAppNavigation('https://example.com', appUrl), false);
  assert.equal(isAllowedAppNavigation('javascript:alert(1)', appUrl), false);
});

test('external link handler accepts web pages and mail links only', () => {
  assert.equal(externalUrl('https://github.com/IAPro-Community/AIOffice'), 'https://github.com/IAPro-Community/AIOffice');
  assert.equal(externalUrl('mailto:support@example.com'), 'mailto:support@example.com');
  assert.equal(externalUrl('file:///C:/secrets.txt'), undefined);
  assert.equal(externalUrl('javascript:alert(1)'), undefined);
});

test('IPC accepts only the trusted main frame', () => {
  const mainFrame = { url: `${appUrl}/` };
  assert.equal(validateDesktopRequest({ senderFrame: mainFrame }, appUrl, mainFrame), true);
  assert.equal(validateDesktopRequest({ senderFrame: { url: `${appUrl}/` } }, appUrl, mainFrame), false);
  assert.equal(validateDesktopRequest({ senderFrame: { url: 'https://example.com' } }, appUrl, mainFrame), false);
});

test('local server readiness must come from this launch and report the installed version', () => {
  const ready = { type: 'aioffice-server-ready', nonce: 'launch-secret', version: '2.0.0' };
  assert.equal(isTrustedServerReady(ready, 'launch-secret', '2.0.0'), true);
  assert.equal(isTrustedServerReady(ready, 'another-launch', '2.0.0'), false);
  assert.equal(isTrustedServerReady(ready, 'launch-secret', '1.9.0'), false);
  assert.equal(isTrustedServerReady({ ...ready, type: 'other-message' }, 'launch-secret', '2.0.0'), false);
});
