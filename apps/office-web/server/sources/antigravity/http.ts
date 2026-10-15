// Endpoint local dos hooks oficiais do Antigravity.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError, readJson, sendJson } from '../../http/app.js';
import { AntigravitySource, type AntigravityEventName, type AntigravityHookEvent } from './source.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENTS = new Set<AntigravityEventName>(['SessionStart', 'PreInvocation', 'PreToolUse', 'PostToolUse', 'PostInvocation', 'Stop']);
type Rec = Record<string, unknown>;

function rec(value: unknown): Rec | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Rec : undefined;
}

function string(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined;
}

export function parseAntigravityHookEvent(raw: unknown): AntigravityHookEvent {
  const body = rec(raw);
  const payload = rec(body?.payload);
  if (!body || !payload || typeof body.name !== 'string' || !EVENTS.has(body.name as AntigravityEventName)) {
    throw new HttpError(400, 'esperado {name, payload} de um hook oficial do Antigravity');
  }
  const conversationId = string(payload.conversationId, 100);
  if (!conversationId || !UUID.test(conversationId)) throw new HttpError(400, 'conversationId inválido');
  const clean: Rec = { conversationId };
  if (Array.isArray(payload.workspacePaths)) {
    clean.workspacePaths = payload.workspacePaths.slice(0, 8).flatMap((item) => typeof item === 'string' && item.length <= 4_096 ? [item] : []);
  }
  const copyString = (key: string, max: number) => {
    const value = string(payload[key], max);
    if (value) clean[key] = value;
  };
  copyString('transcriptPath', 4_096);
  copyString('modelName', 200);
  copyString('error', 4_000);
  copyString('terminationReason', 120);
  if (Number.isInteger(payload.stepIdx)) clean.stepIdx = payload.stepIdx;
  if (Number.isInteger(payload.executionNum)) clean.executionNum = payload.executionNum;
  if (typeof payload.fullyIdle === 'boolean') clean.fullyIdle = payload.fullyIdle;
  const toolCall = rec(payload.toolCall);
  const toolName = string(toolCall?.name, 120);
  if (toolCall && toolName) {
    const args = rec(toolCall.args) ?? {};
    clean.toolCall = { name: toolName, args: Object.fromEntries(['toolSummary', 'toolAction', 'CommandLine', 'command', 'Description', 'description', 'TargetFile', 'AbsolutePath', 'DirectoryPath', 'path', 'Query', 'query', 'Url', 'url', 'Cwd', 'cwd'].flatMap((key) => typeof args[key] === 'string' ? [[key, args[key].slice(0, 2000)]] : [])) };
  }
  return { name: body.name as AntigravityEventName, payload: clean };
}

function fail(res: ServerResponse, error: unknown): void {
  if (res.headersSent) return void res.destroy();
  if (error instanceof HttpError) sendJson(res, error.status, { error: error.message });
  else sendJson(res, 500, { error: 'erro interno' });
}

export function createAntigravityEventHandler(source: AntigravitySource): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    if ((req.method ?? 'GET') !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'método não permitido' });
    }
    readJson(req).then((body) => {
      const event = parseAntigravityHookEvent(body);
      sendJson(res, 200, { ok: source.applyHookEvent(event) });
    }).catch((error) => fail(res, error));
  };
}

\n