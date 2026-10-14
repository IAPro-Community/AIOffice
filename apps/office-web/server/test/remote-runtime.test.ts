import { describe, expect, it } from 'vitest';
import { parseQuickTunnelUrl, QUICK_TUNNEL_START_TIMEOUT_MS } from '../remote/runtime';

describe('parseQuickTunnelUrl', () => {
  it('extrai a URL Quick Tunnel mesmo quando o log acrescenta pontuação', () => {
    expect(parseQuickTunnelUrl('INF + https://office-123.trycloudflare.com.\n'))
      .toEqual({ url: 'https://office-123.trycloudflare.com', hostname: 'office-123.trycloudflare.com' });
  });

  it.each([
    'https://office.trycloudflare.com:4444',
    'https://office.trycloudflare.com/path',
    'https://office.trycloudflare.com.evil.example',
    'http://office.trycloudflare.com',
    'https://nested.office.trycloudflare.com',
    'https://office.trycloudflare.com@evil.example',
  ])('rejeita URL que não seja o host HTTPS exato do Quick Tunnel: %s', (url) => {
    expect(parseQuickTunnelUrl(`tunnel URL ${url}`)).toBeUndefined();
  });
});

describe('Quick Tunnel startup', () => {
  it('waits up to two minutes for cloudflared to publish its URL', () => {
    expect(QUICK_TUNNEL_START_TIMEOUT_MS).toBe(2 * 60 * 1000);
  });
});
