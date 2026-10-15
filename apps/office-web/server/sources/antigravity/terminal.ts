// Converte os registros JSONL oficiais do Antigravity em entradas do terminal compartilhado.
// Thinking interno não é exibido; prompts, texto visível, ferramentas e mensagens de sistema são.
import { createHash } from 'node:crypto';
import type { TerminalEntry, TerminalInputKind } from '../../../shared/types.js';
import { maskSecrets } from '../../../shared/activity.js';
import type { TerminalParser } from '../terminal.js';

type Rec = Record<string, unknown>;

const TEXT_MAX = 20_000;
const DETAIL_MAX = 4_000;
const INPUT_MAX = 2_000;
const RESULT_MAX = 4_000;
const SEEN_MAX = 20_000;

function rec(value: unknown): Rec | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Rec : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** Corrige strings que o Antigravity serializa com um par extra de aspas. */
function toolString(value: unknown): string | undefined {
  const raw = str(value);
  if (!raw) return undefined;
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      const decoded: unknown = JSON.parse(raw);
      if (typeof decoded === 'string' && decoded.trim()) return decoded.trim();
    } catch {
      // Aspas podem fazer parte de um comando ou caminho legítimo.
    }
  }
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) return raw.slice(1, -1).trim() || undefined;
  return raw;
}

function arg(args: Rec, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = toolString(args[key]);
    if (value) return value;
  }
  return undefined;
}

function timestamp(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(n) ? n : Date.now();
}

function safe(value: string, limit: number): string {
  const masked = maskSecrets(value.slice(0, limit * 4));
  return masked.length > limit ? `${masked.slice(0, limit - 1)}…` : masked;
}

function json(value: unknown, limit: number): string | undefined {
  if (value === undefined) return undefined;
  try {
    return safe(JSON.stringify(value), limit);
  } catch {
    return undefined;
  }
}

function idOf(line: string, step: number, kind: string): string {
  return `ag-${step}-${kind}-${createHash('sha1').update(line).digest('hex').slice(0, 12)}`;
}

function toolTitle(name: string, args: Rec): { title: string; inputKind: TerminalInputKind } {
  const candidate = arg(args, 'toolSummary', 'toolAction', 'CommandLine', 'command', 'TargetFile', 'AbsolutePath', 'path', 'Query', 'query');
  const excerpt = candidate?.replace(/\s+/g, ' ').trim();
  const lower = name.toLowerCase();
  const displayName = /run_command|terminal|shell/.test(lower) ? 'Bash'
    : /view_file|read_file/.test(lower) ? 'Read'
      : /list_dir/.test(lower) ? 'LS'
        : /write_to_file|create_file/.test(lower) ? 'Write'
          : /replace_file_content|edit_file/.test(lower) ? 'Edit'
            : /search_web|web_search/.test(lower) ? 'WebSearch'
              : /browser/.test(lower) ? 'WebFetch' : name;
  const title = excerpt ? `${displayName}(${safe(excerpt, 90)})` : displayName;
  const inputKind: TerminalInputKind = /run_command|terminal|shell|command/.test(lower)
    ? 'command'
    : /write_to_file|replace_file_content|multi_replace_file_content|edit_file/.test(lower)
      ? 'diff'
      : candidate ? 'text' : 'json';
  return { title, inputKind };
}

/** Parser novo para cada stream; identifica duplicatas sem incluir conteúdo privado no id. */
export function createAntigravityTerminalParser(): TerminalParser {
  const seen = new Set<string>();
  const order: string[] = [];

  return {
    push(line: string): TerminalEntry[] {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        return [];
      }
      const item = rec(parsed);
      if (!item || typeof item.type !== 'string') return [];
      const step = Number.isInteger(item.step_index) ? Number(item.step_index) : 0;
      const at = timestamp(item.created_at);
      const type = item.type;
      const source = str(item.source);
      const status = str(item.status);
      const content = str(item.content);
      const entries: TerminalEntry[] = [];
      const base = idOf(line, step, type);

      if ((type === 'USER_INPUT' || (type === 'GENERIC' && source === 'USER_EXPLICIT')) && content) {
        entries.push({ kind: 'user', id: base, at, text: safe(content, TEXT_MAX) });
      } else if (type === 'GENERIC' && source === 'MODEL' && content && status !== 'ERROR') {
        entries.push({ kind: 'assistant', id: base, at, text: safe(content, TEXT_MAX) });
      } else if ((type === 'GENERIC' || type === 'SYSTEM_MESSAGE' || type === 'CHECKPOINT') && content) {
        entries.push({
          kind: 'system',
          id: base,
          at,
          text: status === 'ERROR' ? 'Antigravity registrou um erro' : type === 'CHECKPOINT' ? 'Ponto de controle da sessão' : 'Mensagem do Antigravity',
          detail: safe(content, DETAIL_MAX),
          ...(status === 'ERROR' ? { level: 'error' as const } : {}),
        });
      } else if (type === 'PLANNER_RESPONSE' && content) {
        entries.push({ kind: 'assistant', id: base, at, text: safe(content, TEXT_MAX) });
      }

      if (type === 'PLANNER_RESPONSE' && Array.isArray(item.tool_calls)) {
        item.tool_calls.slice(0, 32).forEach((raw, index) => {
          const call = rec(raw);
          const name = str(call?.name);
          if (!call || !name) return;
          const rawArgs = rec(call.args) ?? {};
          // Somente argumentos públicos de apresentação; descarta reasoning e campos privados.
          const args = Object.fromEntries(['toolSummary', 'toolAction', 'CommandLine', 'command', 'Description', 'description', 'TargetFile', 'AbsolutePath', 'DirectoryPath', 'path', 'Query', 'query', 'Url', 'url', 'Cwd', 'cwd'].flatMap((key) => typeof rawArgs[key] === 'string' ? [[key, rawArgs[key]]] : []));
          const { title, inputKind } = toolTitle(name, args);
          const input = json(args, INPUT_MAX);
          entries.push({
            kind: 'tool',
            id: `${base}-tool-${index}`,
            at,
            tool: name,
            title,
            ...(input ? { input, inputKind } : {}),
          });
        });
      }

      const fresh = entries.filter((entry) => !seen.has(entry.id));
      for (const entry of fresh) {
        seen.add(entry.id);
        order.push(entry.id);
      }
      while (order.length > SEEN_MAX) seen.delete(order.shift()!);
      return fresh;
    },
  };
}
