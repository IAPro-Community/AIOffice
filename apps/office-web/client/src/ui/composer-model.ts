// Caixa de mensagem (ui/composer.ts), parte pura e testada em ui/composer-model.test.ts: quando a caixa aparece (e
// por que não), o que a tecla Enter faz, a linha de situação de cada envio e o ritmo da consulta da entrega.
// No Codex a mensagem entra na fila da sessão (`codex queue`) e vira prompt quando ela fica ociosa. O desktop
// localiza o binário nativo da CLI instalada; no Docker, a entrega precisa do auxiliar no host.
import { MESSAGE_MAX } from '../../../shared/messages';
import type { AgentInfo, OutboxStatus, Provider } from '../../../shared/types';
import { tr } from '../../../shared/i18n';

/** Dica para uma sessão Claude Code que ainda não carregou o plugin instalado pelo AIOffice. */
export const PLUGIN_HINT = tr('O AIOffice instala o plugin de mensagens do Claude Code ao iniciar; feche e reabra esta sessão para carregá-lo');
/** Dica para uma sessão OMP que ainda não carregou a extensão instalada pelo AIOffice. */
export const OMP_HINT = tr('O AIOffice instala a extensão OMP ao iniciar; feche e reabra esta sessão para carregá-la');
/** Dica para o Codex quando ainda não há um executor nativo disponível. */
export const CODEX_DELIVERY_HINT = tr('O AIOffice não encontrou o executor local do Codex. No Docker, mantenha o auxiliar ativo no host; no aplicativo instalado, confira Ajuda → Diagnóstico');

/**
 * - ready: dá para mandar (principal com o plugin conectado, recurso ligado, página local);
 * - hint: recurso ligado e principal presente, mas a integração ainda não está conectada (`text` explica o estado);
 * - off: não dá (`text` diz por quê). A gaveta esconde a caixa; o terminal mostra o motivo no lugar dela.
 */
export type ComposerMode = { kind: 'ready' } | { kind: 'hint'; text: string } | { kind: 'off'; text: string };

export interface ComposerEnv {
  /** Recurso ligado no servidor (OfficeSnapshot.meta.messages; no ?mock=1, sempre). */
  enabled: boolean;
  /** Página aberta pelo próprio computador (o servidor só aceita mensagens assim). */
  local: boolean;
  /** Timelapse: o escritório mostrado é o do momento reproduzido. */
  replaying: boolean;
}

export function composerMode(agent: AgentInfo | undefined, env: ComposerEnv): ComposerMode {
  if (env.replaying) return { kind: 'off', text: tr('Sem mensagens no timelapse: o escritório mostrado é o de outro momento') };
  if (agent?.kind === 'sub') return { kind: 'off', text: tr('Subagentes não recebem mensagens: escreva para o agente principal') };
  if (!agent || agent.status === 'offline' || agent.status === 'done') return { kind: 'off', text: tr('Sessão encerrada') };
  if (!env.enabled) {
    const text = agent.provider === 'codex'
      ? tr('Para responder, use o Codex')
      : agent.provider === 'omp'
        ? tr('Para responder, use o terminal do OMP')
        : tr('Para responder, use o terminal do Claude Code');
    return { kind: 'off', text };
  }
  if (!env.local) return { kind: 'off', text: tr('Para mandar mensagens por aqui, abra o Habblaud por http://localhost (ou 127.0.0.1)') };
  if (agent.canMessage !== true) {
    const text = agent.provider === 'codex' ? CODEX_DELIVERY_HINT : agent.provider === 'omp' ? OMP_HINT : PLUGIN_HINT;
    return { kind: 'hint', text };
  }
  return { kind: 'ready' };
}

/** Dica embaixo da caixa (gaveta): como a mensagem entra na sessão. */
export function composerTip(provider: Provider = 'claude'): string {
  return provider === 'codex'
    ? tr('Entra na fila da sessão e vira o próximo prompt quando o Codex terminar o que está fazendo. Enter manda; Shift+Enter quebra a linha.')
    : tr('Entra na sessão como se você tivesse digitado. Enter manda; Shift+Enter quebra a linha.');
}

/** O que sai da caixa: o texto como foi digitado, sem os espaços e linhas em branco do fim. */
export function messageText(raw: string): string {
  return raw.replace(/\s+$/, '');
}

export function canSend(raw: string): boolean {
  const text = messageText(raw);
  return text.trim().length > 0 && text.length <= MESSAGE_MAX;
}

/** Enter manda; Shift+Enter (e Alt+Enter) quebram a linha; Enter compondo um acento (IME) não conta. */
export function enterSends(e: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'altKey' | 'isComposing'>): boolean {
  return e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.isComposing;
}

/**
 * Situação do último envio de um agente: `sending` (o POST ainda não voltou), `rejected` (o servidor recusou: o texto
 * fica na caixa) ou a situação da mensagem no servidor (OutboxStatus).
 */
export type SendPhase = 'sending' | 'rejected' | OutboxStatus;

export interface SendState {
  phase: SendPhase;
  /** Id da mensagem no servidor (depois do 201). */
  id?: string;
  error?: string;
  /** Última mudança (epoch ms, relógio da página). */
  at: number;
}

export function isSettled(phase: SendPhase): boolean {
  return phase === 'delivered' || phase === 'failed' || phase === 'rejected';
}

/** "Entregue" some sozinho depois deste tempo; erros ficam até o próximo envio. */
export const DELIVERED_SHOW_MS = 12_000;

/** Texto da linha de situação ('' = nada a mostrar). */
export function sendStatusText(s: SendState | undefined, now: number, provider: Provider = 'claude'): string {
  if (!s) return '';
  const codex = provider === 'codex';
  switch (s.phase) {
    case 'sending':
      return tr('Enviando…');
    case 'queued':
      return codex ? tr('Na fila: entregando ao Codex…') : tr('Na fila: esperando a sessão buscar a mensagem…');
    case 'sent':
      return tr('Entregando à sessão…');
    case 'delivered':
      // Entregue = entrou na sessão ou na fila dela (com o agente ocupado, só entra quando ele terminar o turno). No
      // Codex é sempre a fila: o dono da sessão a consulta a cada ~10 s e só a usa com a sessão ociosa.
      if (now - s.at >= DELIVERED_SHOW_MS) return '';
      return codex
        ? tr('Entregue ✓ na fila da sessão: entra quando o Codex terminar o que está fazendo (até ~10 s)')
        : tr('Entregue ✓ (se o agente estiver ocupado, entra quando ele terminar)');
    case 'rejected':
      return tr('Não foi possível mandar: {0}', [s.error ?? tr('erro desconhecido')]);
    case 'failed':
      return tr('Não foi entregue: {0}', [s.error ?? tr('erro desconhecido')]);
  }
}

/** Consulta da entrega: o servidor leva até ~90 s para desistir (60 s na fila + 30 s sem confirmação). */
export const POLL_LIMIT_MS = 120_000;

/** Espera até a próxima consulta: rápida no começo (a sessão busca a cada 2 s), mais espaçada depois. */
export function pollDelay(elapsed: number): number {
  if (elapsed < 10_000) return 700;
  if (elapsed < 40_000) return 1_500;
  return 3_000;
}

export const LOST_ERROR = tr('o Habblaud não conhece mais esta mensagem (ele reiniciou?)');
export const TIMEOUT_ERROR = tr('sem notícia da entrega: confira no terminal do Claude Code');
export const CODEX_TIMEOUT_ERROR = tr('sem notícia da entrega: confira no Codex');
export const OFFLINE_ERROR = tr('não foi possível falar com o Habblaud');

/** Prazo da consulta acabou sem notícia: onde conferir. */
export function timeoutError(provider: Provider = 'claude'): string {
  return provider === 'codex' ? CODEX_TIMEOUT_ERROR : TIMEOUT_ERROR;
}
