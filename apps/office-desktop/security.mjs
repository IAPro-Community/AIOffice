export function isAllowedAppNavigation(candidate, appUrl) {
  try {
    const target = new URL(candidate);
    const local = new URL(appUrl);
    return target.protocol === 'http:' && target.origin === local.origin;
  } catch {
    return false;
  }
}

export function externalUrl(candidate) {
  try {
    const target = new URL(candidate);
    return target.protocol === 'https:' || target.protocol === 'http:' || target.protocol === 'mailto:'
      ? target.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function validateDesktopRequest(event, appUrl, mainFrame) {
  if (event.senderFrame !== mainFrame) return false;
  return isAllowedAppNavigation(event.senderFrame.url, appUrl);
}

export function isTrustedServerReady(message, nonce, version) {
  return !!message && typeof message === 'object'
    && message.type === 'aioffice-server-ready'
    && message.nonce === nonce
    && message.version === version;
}
