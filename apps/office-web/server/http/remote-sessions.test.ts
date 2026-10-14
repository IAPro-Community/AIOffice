import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountsService } from '../accounts/service';
import { NameStore } from '../model/names';
import { Office } from '../model/office';
import { tempDir } from '../test/fixtures';
import { createApiHandler, type ApiDeps } from './app';
import { createRequestGuard } from './guard';
import { COOKIE, createRemoteGate, RemoteLoginCodes, RemoteSessions, SESSION_MS, type RemoteSessionInfo } from './remote';
import { Hub } from './sse';

const NOW = 1_800_000_000_000;
const SECRET = Buffer.alloc(32, 7);
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 15; PrivateDevice123) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36';

describe('remote session inventory', () => {
  it('records issuance metadata with a separate opaque id and the existing twelve-hour lifetime', () => {
    const sessions = new RemoteSessions(SECRET, { user: 'aioffice' }, () => NOW);
    const issued = sessions.issue(ANDROID_UA);
    const [record] = sessions.list();

    expect(record).toEqual({
      id: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/),
      device: 'Chrome · Android',
      loggedInAt: NOW,
      lastSeenAt: NOW,
      expiresAt: NOW + SESSION_MS,
    });
    expect(issued.maxAgeS).toBe(12 * 60 * 60);
    expect(sessions.verify(issued.token)).toBe(true);
    expect(issued.token).not.toContain(record.id);
  });

  it.each([
    ['Mozilla/5.0 (iPhone) Version/18.0 Mobile/15E148 Safari/604.1', 'Safari · iOS'],
    ['Mozilla/5.0 (Windows NT 10.0) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0', 'Edge · Windows'],
    ['Mozilla/5.0 (Macintosh) Firefox/130.0', 'Firefox · macOS'],
    ['untrusted <script>192.0.2.7</script>', 'Browser · Unknown'],
  ])('uses only a coarse allowlisted label for %s', (ua, expected) => {
    const sessions = new RemoteSessions(SECRET, { user: 'aioffice' }, () => NOW);
    sessions.issue(ua);
    expect(sessions.list()[0].device).toBe(expected);
  });

  it('updates last-seen on access without extending expiry or treating verification as activity', () => {
    let now = NOW;
    const sessions = new RemoteSessions(SECRET, { user: 'aioffice' }, () => now);
    const { token } = sessions.issue();
    now += 1_000;
    sessions.verify(token);
    expect(sessions.list()[0].lastSeenAt).toBe(NOW);
    sessions.touch(token);
    expect(sessions.list()[0]).toMatchObject({ lastSeenAt: now, expiresAt: NOW + SESSION_MS });
    now += 1_000;
    sessions.touch(`${token.slice(0, -1)}!`);
    expect(sessions.list()[0].lastSeenAt).toBe(now - 1_000);
  });

  it('returns detached records containing only public metadata', () => {
    const sessions = new RemoteSessions(SECRET, { user: 'aioffice' }, () => NOW);
    const { token } = sessions.issue(ANDROID_UA);
    const record = sessions.list()[0];
    expect(Object.keys(record).sort()).toEqual(['device', 'expiresAt', 'id', 'lastSeenAt', 'loggedInAt']);
    const json = JSON.stringify(record);
    for (const value of [token, token.split('.')[3], ANDROID_UA, 'PrivateDevice123', SECRET.toString('hex')]) {
      expect(json).not.toContain(value);
    }
    record.device = 'modified';
    expect(sessions.list()[0].device).toBe('Chrome · Android');
  });

  it('revokes one session by id, preserves the other, and keeps logout revocation effective', () => {
    const sessions = new RemoteSessions(SECRET, { user: 'aioffice' }, () => NOW);
    const first = sessions.issue();
    const second = sessions.issue();
    const [firstRecord, secondRecord] = sessions.list();
    expect(firstRecord.id).not.toBe(secondRecord.id);
    expect(sessions.revokeById('missing')).toBe(false);
    expect(sessions.revokeById(firstRecord.id)).toBe(true);
    expect(sessions.revokeById(firstRecord.id)).toBe(false);
    expect(sessions.verify(first.token)).toBe(false);
    expect(sessions.verify(second.token)).toBe(true);
    expect(sessions.list()).toEqual([secondRecord]);
    sessions.revoke(second.token);
    expect(sessions.verify(second.token)).toBe(false);
    expect(sessions.list()).toEqual([]);
  });

  it('prunes expired sessions at the exact expiry and invalidates records across clear/recreation', () => {
    let now = NOW;
    const sessions = new RemoteSessions(SECRET, { user: 'aioffice' }, () => now);
    const expired = sessions.issue();
    const id = sessions.list()[0].id;
    now += SESSION_MS;
    expect(sessions.verify(expired.token)).toBe(false);
    expect(sessions.list()).toEqual([]);
    expect(sessions.revokeById(id)).toBe(false);
    const active = sessions.issue();
    const restarted = new RemoteSessions(SECRET, { user: 'aioffice' }, () => now);
    expect(restarted.verify(active.token)).toBe(false);
    sessions.clear();
    expect(sessions.verify(active.token)).toBe(false);
    expect(sessions.list()).toEqual([]);
  });
});

interface Response {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function serve(opts: { remote?: boolean; peer?: string; now?: () => number } = {}) {
  const tmp = tempDir();
  const accounts = new AccountsService({ dirs: [], home: tmp.dir, env: {}, onChange: () => {} });
  const office = new Office({ names: new NameStore(null), version: 't', startedAt: NOW, accounts: () => [], sources: () => [], accountName: () => undefined });
  const hub = new Hub(office);
  const sessions = new RemoteSessions(SECRET, { user: 'aioffice' }, opts.now ?? (() => NOW));
  const codes = new RemoteLoginCodes(opts.now ?? (() => NOW));
  const status = () => ({ available: true, configured: true, state: 'active' as const });
  const access: NonNullable<ApiDeps['remoteAccess']> = {
    status,
    configure: async () => status(),
    start: async () => status(),
    stop: async () => { sessions.clear(); return status(); },
    generateCode: async () => codes.issue(),
    listSessions: () => sessions.list(),
    revokeSession: (id) => sessions.revokeById(id),
  };
  const api = createApiHandler({ office, hub, accounts, sources: () => [], version: 't', inDocker: false, remoteAccess: access });
  const guard = createRequestGuard({ allowedHosts: new Set(['public.trycloudflare.com']) });
  const gate = createRemoteGate({ config: { user: 'aioffice' }, sessions, loginCodes: codes, secure: true });
  const server = http.createServer((req, res) => {
    if (opts.peer) Object.defineProperty(req.socket, 'remoteAddress', { value: opts.peer, configurable: true });
    if (guard(req, res)) return;
    const url = new URL(req.url ?? '/', 'http://x');
    if (opts.remote && gate(req, res, url)) return;
    if (!api(req, res, url)) res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  cleanups.push(async () => {
    hub.stop();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    tmp.cleanup();
  });
  const request = (path: string, method = 'GET', body?: string, headers: Record<string, string> = {}): Promise<Response> => new Promise((resolve, reject) => {
    const req = http.request(`${base}${path}`, { method, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
    });
    req.on('error', reject);
    req.end(body);
  });
  return { base, sessions, codes, request };
}

describe('remote session routes', () => {
  it('lists redacted metadata locally and revokes only the selected session', async () => {
    const env = await serve();
    const first = env.sessions.issue(ANDROID_UA);
    const second = env.sessions.issue();
    const listed = await env.request('/api/remote-access/sessions');
    expect(listed.status).toBe(200);
    expect(listed.headers['cache-control']).toBe('no-store');
    const { sessions } = JSON.parse(listed.body) as { sessions: RemoteSessionInfo[] };
    expect(sessions).toEqual(env.sessions.list());
    expect(listed.body).not.toContain(first.token);
    expect(listed.body).not.toContain(first.token.split('.')[3]);
    expect(listed.body).not.toContain(ANDROID_UA);
    const headers = { Origin: env.base, 'Content-Type': 'application/json' };
    const revoked = await env.request(`/api/remote-access/sessions/${sessions[0].id}/revoke`, 'POST', '{}', headers);
    expect(revoked.status).toBe(200);
    expect(JSON.parse(revoked.body)).toEqual({ ok: true });
    expect(env.sessions.verify(first.token)).toBe(false);
    expect(env.sessions.verify(second.token)).toBe(true);
    expect((await env.request(`/api/remote-access/sessions/${sessions[0].id}/revoke`, 'POST', '{}', headers)).status).toBe(404);
    expect((await env.request('/api/remote-access/sessions/invalid/revoke', 'POST', '{}', headers)).status).toBe(404);
  });

  it('requires the local origin and an empty JSON object for revocation', async () => {
    const env = await serve();
    env.sessions.issue();
    const path = `/api/remote-access/sessions/${env.sessions.list()[0].id}/revoke`;
    expect((await env.request(path, 'POST', '{}', { 'Content-Type': 'application/json' })).status).toBe(403);
    expect((await env.request(path, 'POST', '{}', { Origin: 'https://evil.example', 'Content-Type': 'application/json' })).status).toBe(403);
    expect((await env.request(path, 'POST', '{}', { Origin: env.base, 'Content-Type': 'text/plain' })).status).toBe(415);
    for (const body of ['', 'null', '[]', '{"unexpected":true}', 'invalid']) {
      expect((await env.request(path, 'POST', body, { Origin: env.base, 'Content-Type': 'application/json' })).status).toBe(400);
    }
    expect((await env.request(path, 'GET', undefined, { Origin: env.base })).status).toBe(405);
    expect(env.sessions.list()).toHaveLength(1);
  });

  it('blocks foreign origins, cross-site fetches, public hosts and non-loopback peers', async () => {
    const env = await serve();
    for (const headers of [
      { Origin: 'https://evil.example' },
      { 'Sec-Fetch-Site': 'cross-site' },
      { Host: 'public.trycloudflare.com' },
      { Host: '192.0.2.7' },
    ] as Array<Record<string, string>>) {
      expect((await env.request('/api/remote-access/sessions', 'GET', undefined, headers)).status).toBe(403);
    }
    const lan = await serve({ peer: '192.0.2.7' });
    expect((await lan.request('/api/remote-access/sessions')).status).toBe(403);
    env.sessions.issue();
    const path = `/api/remote-access/sessions/${env.sessions.list()[0].id}/revoke`;
    expect((await env.request(path, 'POST', '{}', { Origin: env.base, 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
  });

  it('keeps management unavailable to authenticated requests marked by the remote gate', async () => {
    const env = await serve({ remote: true });
    const { token } = env.sessions.issue();
    const headers = { Cookie: `${COOKIE}=${token}` };
    expect((await env.request('/api/remote-access/sessions', 'GET', undefined, headers)).status).toBe(403);
    const path = `/api/remote-access/sessions/${env.sessions.list()[0].id}/revoke`;
    expect((await env.request(path, 'POST', '{}', { ...headers, Origin: env.base.replace('http:', 'https:'), 'Content-Type': 'application/json' })).status).toBe(403);
    expect(env.sessions.verify(token)).toBe(true);
  });

  it('captures login User-Agent, consumes the code once and touches authenticated requests', async () => {
    let now = NOW;
    const env = await serve({ remote: true, now: () => now });
    const { code } = env.codes.issue();
    const login = () => env.request('/api/remote/login', 'POST', JSON.stringify({ code }), { 'Content-Type': 'application/json', 'User-Agent': ANDROID_UA, 'CF-Connecting-IP': '192.0.2.7' });
    const res = await login();
    expect(res.status).toBe(200);
    expect(env.sessions.list()[0]).toMatchObject({ device: 'Chrome · Android', loggedInAt: NOW, lastSeenAt: NOW });
    expect(JSON.stringify(env.sessions.list())).not.toContain('192.0.2.7');
    expect((await login()).status).toBe(401);
    const cookie = res.headers['set-cookie']![0].split(';')[0];
    expect(res.headers['set-cookie']![0]).toContain('Max-Age=43200');
    now += 10_000;
    expect((await env.request('/api/health', 'GET', undefined, { Cookie: cookie })).status).toBe(200);
    expect(env.sessions.list()[0].lastSeenAt).toBe(now);
    now = NOW + SESSION_MS;
    expect((await env.request('/api/health', 'GET', undefined, { Cookie: cookie })).status).toBe(401);
    expect(env.sessions.list()).toEqual([]);
  });
});
