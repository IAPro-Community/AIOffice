// CONTRATO do mundo (canvas do escritório) consumido pela UI (client/src/ui/**).
// Implementação: client/src/world/index.ts -> createWorld().
// Regra: mudanças aqui devem ser ADITIVAS.

export type Selection = { type: 'agent'; id: string } | { type: 'room'; id: string } | null;

export interface WorldOptions {
  /** Mostrar etiquetas com os nomes dos personagens. */
  showNames: boolean;
  /** Balões de atividade: todos, só importantes (precisa de você, selecionado, mudanças recentes) ou nenhum. */
  bubbles: 'all' | 'important' | 'none';
  /** Frequência de passeios pelo escritório quando os agentes estão ociosos. */
  liveliness: 'calm' | 'normal' | 'lively';
  /** Câmera acompanha o agente selecionado. */
  followSelected: boolean;
  /** Ciclo dia/noite pela hora local (janelas, iluminação). */
  dayNight: boolean;
  /** (Opcional, aditivo) Ciclo dia/noite: automático, sempre dia ou sempre noite. Vale sobre `dayNight`. */
  daylight?: DaylightMode;
  /** Cenário visual do escritório: calendário, original ou uma ambientação selecionável. */
  theme?: OfficeTheme;
  /** Horários locais e cenários do modo automático. */
  themeSchedule?: ThemeSchedule;
  /** Ativa temas de datas comemorativas no modo automático. */
  holidayThemes?: boolean;
}

/** Cenário que o renderer desenha no escritório. */
export type SeasonalTheme =
  | 'none'
  | 'christmas'
  | 'halloween'
  | 'garden'
  | 'aurora'
  | 'sunset'
  | 'new-year'
  | 'carnival'
  | 'easter'
  | 'valentine'
  | 'festa-junina'
  | 'independence';
export type OfficeTheme = 'auto' | SeasonalTheme;

export interface ThemeTimeSlot {
  /** Hora local em HH:mm; cada faixa termina quando começa a próxima. */
  start: string;
  theme: SeasonalTheme;
}

/** Quatro faixas ordenadas: amanhecer, dia, fim de tarde e noite. */
export type ThemeSchedule = [ThemeTimeSlot, ThemeTimeSlot, ThemeTimeSlot, ThemeTimeSlot];

export const DEFAULT_THEME_SCHEDULE: ThemeSchedule = [
  { start: '06:00', theme: 'garden' },
  { start: '10:00', theme: 'none' },
  { start: '17:00', theme: 'sunset' },
  { start: '20:00', theme: 'aurora' },
];

interface ThemeAutomationOptions {
  themeSchedule?: ThemeSchedule;
  holidayThemes?: boolean;
}

/**
 * Resolve o cenário usando a data e a hora locais do dispositivo. Sem as opções de automação, conserva o
 * comportamento sazonal legado para consumidores antigos do contrato do mundo.
 */
export function seasonalThemeFor(theme: OfficeTheme | undefined, date: Date, automation?: ThemeAutomationOptions): SeasonalTheme {
  if (theme && theme !== 'auto') return theme;
  if (!automation) {
    const month = date.getMonth();
    if (month === 9) return 'halloween';
    if (month === 10 || (month === 11 && date.getDate() <= 26)) return 'christmas';
    return 'none';
  }

  if (automation.holidayThemes !== false) {
    const holiday = holidayThemeFor(date);
    if (holiday) return holiday;
  }

  const schedule = automation.themeSchedule ?? DEFAULT_THEME_SCHEDULE;
  const slots = schedule.filter((slot) => /^([01]\d|2[0-3]):[0-5]\d$/.test(slot.start)).sort((a, b) => timeOfDay(a.start) - timeOfDay(b.start));
  if (!slots.length) return 'none';
  const minute = date.getHours() * 60 + date.getMinutes();
  let active = slots[slots.length - 1];
  for (const slot of slots) {
    if (timeOfDay(slot.start) > minute) break;
    active = slot;
  }
  return active.theme;
}

function timeOfDay(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function dayNumber(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month, day) / 86_400_000);
}

/** Algoritmo gregoriano de Meeus/Jones/Butcher: devolve o domingo de Páscoa. */
function easterSunday(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const value = h + l - 7 * m + 114;
  return dayNumber(year, Math.floor(value / 31) - 1, (value % 31) + 1);
}

/** Calendário internacional com datas brasileiras; as datas fixas e móveis usam o ano local. */
function holidayThemeFor(date: Date): SeasonalTheme | null {
  const month = date.getMonth();
  const day = date.getDate();
  const deltaFromEaster = dayNumber(date.getFullYear(), month, day) - easterSunday(date.getFullYear());
  if (deltaFromEaster >= -50 && deltaFromEaster <= -47) return 'carnival';
  if (deltaFromEaster >= -2 && deltaFromEaster <= 0) return 'easter';
  if ((month === 11 && day >= 27) || (month === 0 && day <= 2)) return 'new-year';
  if (month === 9) return 'halloween';
  if ((month === 10 && day >= 1) || (month === 11 && day <= 26)) return 'christmas';
  if (month === 5 && day >= 15 && day <= 30) return 'festa-junina';
  if ((month === 1 && day === 14) || (month === 5 && day === 12)) return 'valentine';
  if (month === 8 && day === 7) return 'independence';
  return null;
}

/** Ciclo dia/noite: segue a hora local, ou fixa o dia ou a noite. */
export type DaylightMode = 'auto' | 'day' | 'night';

/** Sons do ambiente que o mundo sugere (quem toca, e se toca, é a UI). */
export type SoundCueKind = 'keys' | 'elevator' | 'pingpong' | 'table' | 'arcade';

export interface SoundCue {
  kind: SoundCueKind;
  /** 0..1: proximidade (zoom, fora da tela...). */
  gain: number;
  /** -1 (esquerda) .. 1 (direita): posição na tela. */
  pan: number;
  /** Teclado: quantas teclas na rajada. */
  count?: number;
}

export interface WorldApi {
  /** Seleciona (ou limpa) um agente/sala. `focus` move a câmera até ele. */
  select(sel: Selection, opts?: { focus?: boolean }): void;
  getSelection(): Selection;
  /** Disparado quando a seleção muda (por clique no canvas ou por select()). */
  onSelect(cb: (sel: Selection) => void): () => void;
  /** Agente sob o cursor (para tooltips da UI). */
  onHover(cb: (agentId: string | null) => void): () => void;
  focusAgent(id: string, opts?: { follow?: boolean }): void;
  focusRoom(id: string): void;
  /** Enquadra o prédio inteiro. */
  overview(): void;
  zoomBy(factor: number): void;
  getOptions(): WorldOptions;
  setOptions(o: Partial<WorldOptions>): void;
  /** Posição na tela (CSS px, relativo à viewport) logo acima da cabeça do personagem, ou null se não visível. */
  screenPositionOf(agentId: string): { x: number; y: number } | null;
  /**
   * (Opcional, aditivo) Área da tela coberta por painéis da UI, em px CSS. O mundo passa a enquadrar
   * (visão geral) e centralizar (focusAgent/focusRoom/seguir) dentro da área livre.
   */
  setViewInsets?(insets: Partial<ViewInsets>): void;
  /**
   * (Opcional, aditivo) Vida social de um agente presente no escritório: personalidade, carteira de
   * moedinhas, amizades/rivalidades com quem está lá agora e a roda de que participa. null se não está.
   */
  social?(agentId: string): AgentSocial | null;
  /** (Opcional, aditivo) Botão direito numa sala do escritório: id da sala e o ponto do clique (px da janela). */
  onRoomContextMenu?(cb: (roomId: string, at: { x: number; y: number }) => void): () => void;
  /** (Opcional, aditivo) Acontecimentos sociais (partidas e apostas) para o feed. */
  onSocialEvent?(cb: (e: SocialEvent) => void): () => void;
  /**
   * (Opcional, aditivo) Timelapse: com `p`, o mundo passa a desenhar o dia reproduzido (relógio e fator de
   * animação de `p`); `null` volta ao vivo. Cada chamada recomeça o mundo do zero (ninguém anda até a mesa:
   * todos já aparecem no lugar), então chame ao entrar, ao pular para outro ponto e ao sair; o próximo
   * snapshot do store é aplicado como carga inicial.
   */
  setPlayback?(p: WorldPlayback | null): void;
  /** (Opcional, aditivo) Sons do ambiente: teclado de quem trabalha à vista, elevador, rodas. */
  onSound?(cb: (cue: SoundCue) => void): () => void;
  destroy(): void;
}

/** Relógios do timelapse (ver world/playback.ts). */
export interface WorldPlayback {
  /** Instante reproduzido (epoch ms): hora do céu, da iluminação e do relógio de parede. */
  clock(): number;
  /** Fator de animação (1 = tempo real; 0 = pausado). */
  scale(): number;
}

export interface AgentSocial {
  traits: { emoji: string; label: string; desc: string }[];
  /** Bordão ("Tá pago!"). */
  catchphrase: string;
  /** Saldo de moedinhas (🪙). */
  coins: number;
  /** Quanto já ganhou trabalhando (saldo inicial + tarefas + pedidos + entregas). */
  earned: number;
  wins: number;
  losses: number;
  /** Colegas presentes com quem tem amizade ou rivalidade; `record` = [vitórias, derrotas] contra ele. */
  bonds: { id: string; name: string; kind: 'amizade' | 'rivalidade'; record: [number, number] | null }[];
  /** O que está fazendo numa roda agora ("📺 Vendo futebol na TV com Rafaela"), ou null. */
  doing: string | null;
  /** Extrato: movimentações mais recentes primeiro. */
  ledger: { at: number; delta: number; icon: string; text: string }[];
}

/** Partida/aposta resolvida (vira uma linha do feed). */
export interface SocialEvent {
  id: string;
  at: number;
  icon: string;
  /** Protagonista (quem venceu). */
  agentId: string;
  /** Texto sem o nome do protagonista: "ganhou 🪙10 de Caio no jokenpô". */
  text: string;
  /** Onde aconteceu ("Lounge", "Copa"...). */
  place: string;
}

/** Margens da viewport cobertas pela UI (px CSS). */
export interface ViewInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_WORLD_OPTIONS: WorldOptions = {
  showNames: true,
  bubbles: 'important',
  liveliness: 'normal',
  followSelected: false,
  dayNight: true,
  theme: 'auto',
  themeSchedule: DEFAULT_THEME_SCHEDULE,
  holidayThemes: true,
};
