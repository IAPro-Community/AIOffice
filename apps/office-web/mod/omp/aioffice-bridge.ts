/**
 * AIOffice Bridge Extension for oh-my-pi (omp).
 * Polls the local Habblaud inbox and delivers messages to the active OMP session.
 */

type OmpContext = {
  sessionManager?: { getSessionId?: () => unknown };
  sessionId?: unknown;
  setInterval?: (callback: () => void | Promise<void>, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
};

type OmpExtensionApi = {
  on: (event: string, handler: (event: unknown, ctx: OmpContext) => void | Promise<void>) => void;
  sendUserMessage?: (text: string) => unknown | Promise<unknown>;
};

type InboxMessage = { id: string; text: string };
type AckResult = { id: string; ok: boolean; error?: string };
type PendingAck = { session: string; result: AckResult };

const HABBLAUD_URL = 'http://127.0.0.1:4747';
const POLL_INTERVAL_MS = 1500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isInboxMessage(value: unknown): value is InboxMessage {
  return isRecord(value) && typeof value.id === 'string' && typeof value.text === 'string';
}

function eventSessionId(event: unknown): string {
  return isRecord(event) && typeof event.sessionId === 'string' ? event.sessionId : '';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 240);
  return 'falha ao enviar para a sessão OMP';
}

export default function aiofficeBridge(pi: OmpExtensionApi): void {
  let sessionId = '';
  let active = false;
  let polling = false;
  let timerStarted = false;
  let stopPolling: (() => void) | undefined;
  const pendingAcks = new Map<string, PendingAck>();

  async function flushPendingAcks(): Promise<void> {
    const bySession = new Map<string, AckResult[]>();
    for (const pending of pendingAcks.values()) {
      const results = bySession.get(pending.session) ?? [];
      results.push(pending.result);
      bySession.set(pending.session, results);
    }

    for (const [session, results] of bySession) {
      try {
        const response = await fetch(`${HABBLAUD_URL}/api/mod/inbox/ack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session, results }),
        });
        if (response.ok) {
          for (const result of results) pendingAcks.delete(result.id);
        }
      } catch {
        // Retain the ACK and retry during the next polling cycle.
      }
    }
  }

  async function pollInbox(): Promise<void> {
    if (polling || !active || !sessionId) return;
    polling = true;
    const polledSession = sessionId;
    try {
      await flushPendingAcks();
      const response = await fetch(`${HABBLAUD_URL}/api/mod/inbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: polledSession }),
      });
      if (!response.ok) return;

      const payload: unknown = await response.json();
      if (!isRecord(payload) || !Array.isArray(payload.messages)) return;

      for (const message of payload.messages) {
        if (!isInboxMessage(message) || !active || sessionId !== polledSession) continue;
        if (pendingAcks.has(message.id)) continue;

        let result: AckResult;
        try {
          if (typeof pi.sendUserMessage !== 'function') {
            throw new Error('API sendUserMessage indisponível');
          }
          // Sem deliverAs: inicia a rodada quando o OMP está ocioso e entra como steer durante uma rodada.
          await pi.sendUserMessage(message.text);
          result = { id: message.id, ok: true };
        } catch (error) {
          result = { id: message.id, ok: false, error: errorMessage(error) };
        }
        pendingAcks.set(message.id, { session: polledSession, result });
      }

      await flushPendingAcks();
    } catch {
      // A sessão segue ativa; a próxima rodada tenta buscar novamente.
    } finally {
      polling = false;
    }
  }

  function startPolling(ctx: OmpContext): void {
    if (timerStarted) return;
    if (typeof ctx.setInterval === 'function') {
      const timer = ctx.setInterval(pollInbox, POLL_INTERVAL_MS);
      stopPolling = () => ctx.clearTimer?.(timer);
    } else {
      // Compatibilidade com versões antigas do OMP; o callback isola rejeições e limpa o timer no shutdown.
      const timer = setInterval(() => {
        void pollInbox().catch(() => undefined);
      }, POLL_INTERVAL_MS);
      const unref = (timer as unknown as { unref?: () => void }).unref;
      if (typeof unref === 'function') unref.call(timer);
      stopPolling = () => clearInterval(timer);
    }
    timerStarted = true;
  }

  function activateSession(event: unknown, ctx: OmpContext): void {
    const contextId = ctx.sessionManager?.getSessionId?.();
    const nextSession = typeof contextId === 'string' ? contextId : typeof ctx.sessionId === 'string' ? ctx.sessionId : eventSessionId(event);
    if (!nextSession) {
      active = false;
      sessionId = '';
      return;
    }
    sessionId = nextSession;
    active = true;
    startPolling(ctx);
  }

  pi.on('session_start', activateSession);
  pi.on('session_switch', activateSession);
  pi.on('session_branch', activateSession);
  pi.on('session_shutdown', () => {
    active = false;
    sessionId = '';
    stopPolling?.();
    stopPolling = undefined;
    timerStarted = false;
  });
}
