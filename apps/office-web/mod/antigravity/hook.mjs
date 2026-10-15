#!/usr/bin/env node
// Hooks globais do Antigravity: reportam eventos e retiram mensagens do inbox no próximo PreInvocation.
// PreToolUse não emite decisão; a política nativa e os outros hooks permanecem responsáveis.

const EVENT_NAMES = new Set(['SessionStart', 'PreInvocation', 'PreToolUse', 'PostToolUse', 'PostInvocation', 'Stop']);
const FALLBACK_PORT = 4747;
const REQUEST_TIMEOUT_MS = 1_500;
const INPUT_MAX = 256 * 1024;

function option(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function portOf() {
  const n = Number(option('--port') ?? process.env.HABBLAUD_PORT ?? FALLBACK_PORT);
  return Number.isInteger(n) && n > 0 && n < 65_536 ? n : FALLBACK_PORT;
}

async function readInput() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > INPUT_MAX) throw new Error('hook input too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function publicArgs(value) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(['toolSummary', 'toolAction', 'CommandLine', 'command', 'Description', 'description', 'TargetFile', 'AbsolutePath', 'DirectoryPath', 'path', 'Query', 'query', 'Url', 'url', 'Cwd', 'cwd'].flatMap((key) => typeof value[key] === 'string' ? [[key, value[key].slice(0, 2000)]] : []));
}

function payloadOf(input) {
  const payload = {};
  for (const key of ['conversationId', 'transcriptPath', 'modelName', 'stepIdx', 'executionNum', 'terminationReason', 'fullyIdle', 'error']) {
    const value = input?.[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') payload[key] = typeof value === 'string' ? value.slice(0, 4_000) : value;
  }
  if (Array.isArray(input?.workspacePaths)) payload.workspacePaths = input.workspacePaths.slice(0, 8).filter((p) => typeof p === 'string').map((p) => p.slice(0, 4_096));
  const toolCall = input?.toolCall;
  if (toolCall && typeof toolCall === 'object' && typeof toolCall.name === 'string') {
    payload.toolCall = { name: toolCall.name.slice(0, 120), args: publicArgs(toolCall.args) };
  }
  return payload;
}

async function post(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`http://127.0.0.1:${portOf()}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) return undefined;
    return await response.json().catch(() => undefined);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function writeOutput(value) {
  await new Promise((resolve) => process.stdout.write(`${JSON.stringify(value)}\n`, resolve));
}

async function main() {
  const name = option('--event');
  if (!EVENT_NAMES.has(name)) return void await writeOutput({});
  let input;
  try {
    input = await readInput();
  } catch {
    return void await writeOutput({});
  }

  const registered = await post('/api/antigravity/events', { name, payload: payloadOf(input) });
  if (registered?.ok === true && name === 'PreInvocation' && typeof input?.conversationId === 'string') {
    const result = await post('/api/mod/inbox', { session: input.conversationId });
    const messages = Array.isArray(result?.messages) ? result.messages.slice(0, 8) : [];
    const valid = messages.filter((message) => typeof message?.id === 'string' && typeof message?.text === 'string');
    const output = { injectSteps: valid.map((message) => ({ userMessage: message.text })) };
    await writeOutput(output);
    if (valid.length) {
      await post('/api/mod/inbox/ack', {
        session: input.conversationId,
        results: valid.map((message) => ({ id: message.id, ok: true })),
      });
    }
    return;
  }

  if (name === 'PreToolUse') {
    // Nenhuma decisão de permissão sai desta ponte de observação.
    return void await writeOutput({});
  }
  if (name === 'Stop') return void await writeOutput({});
  await writeOutput({});
}

main().catch(async () => { await writeOutput({}); });
