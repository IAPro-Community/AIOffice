// Preferências da interface, persistidas em localStorage ('habblaud:prefs').
// Puro: o armazenamento é injetado (testável em node).
import { DEFAULT_SOUND_SETTINGS, sanitizeSoundSettings, type SoundSettings } from '../audio/scheduler';
import type { DaylightMode, ThemeSchedule, ThemeTimeSlot, WorldOptions } from '../world/api';
import { DEFAULT_THEME_SCHEDULE, DEFAULT_WORLD_OPTIONS } from '../world/api';

export const PREFS_KEY = 'habblaud:prefs';

export type UiPalette = 'midnight' | 'forest' | 'ember' | 'high-contrast';

export interface UiPrefs {
  showNames: boolean;
  bubbles: WorldOptions['bubbles'];
  liveliness: WorldOptions['liveliness'];
  /** Ciclo dia/noite: automático (hora local), sempre dia ou sempre noite. */
  daylight: DaylightMode;
  /** Paleta dos painéis da interface; independente do cenário do escritório. */
  uiPalette: UiPalette;
  theme: NonNullable<WorldOptions['theme']>;
  /** Temas comemorativos com datas avaliadas no calendário local. */
  holidayThemes: boolean;
  /** Início local das quatro faixas do cenário automático. */
  themeSchedule: ThemeSchedule;
  /** Sons sintetizados (interruptor geral; desligado por padrão). */
  sound: boolean;
  /** Volume mestre e categorias dos sons. */
  sounds: SoundSettings;
  /** Notification do navegador para alertas com a aba oculta. */
  browserNotifications: boolean;
  sidebarOpen: boolean;
  feedOpen: boolean;
  /** Contas ocultas na barra lateral (AccountInfo.id). */
  hiddenAccounts: string[];
}

export const DEFAULT_PREFS: UiPrefs = {
  showNames: DEFAULT_WORLD_OPTIONS.showNames,
  bubbles: DEFAULT_WORLD_OPTIONS.bubbles,
  liveliness: DEFAULT_WORLD_OPTIONS.liveliness,
  daylight: 'auto',
  uiPalette: 'midnight',
  theme: 'auto',
  holidayThemes: true,
  themeSchedule: DEFAULT_THEME_SCHEDULE.map((slot) => ({ ...slot })) as ThemeSchedule,
  sound: false,
  sounds: DEFAULT_SOUND_SETTINGS,
  browserNotifications: false,
  sidebarOpen: true,
  feedOpen: true,
  hiddenAccounts: [],
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

const SEASONAL_THEMES = ['none', 'christmas', 'halloween', 'garden', 'aurora', 'sunset', 'new-year', 'carnival', 'easter', 'valentine', 'festa-junina', 'independence'] as const;

export function isValidThemeSchedule(schedule: readonly ThemeTimeSlot[]): schedule is ThemeSchedule {
  if (schedule.length !== DEFAULT_THEME_SCHEDULE.length) return false;
  let previous = -1;
  for (const slot of schedule) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.start)) return false;
    const [hours, minutes] = slot.start.split(':').map(Number);
    const start = hours * 60 + minutes;
    if (start <= previous || !SEASONAL_THEMES.includes(slot.theme)) return false;
    previous = start;
  }
  return true;
}

function sanitizeThemeSchedule(value: unknown): ThemeSchedule {
  if (!Array.isArray(value) || value.length !== DEFAULT_THEME_SCHEDULE.length) return DEFAULT_THEME_SCHEDULE.map((slot) => ({ ...slot })) as ThemeSchedule;
  const schedule = value.map((entry, index) => {
    const slot = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    return {
      start: typeof slot.start === 'string' ? slot.start : DEFAULT_THEME_SCHEDULE[index].start,
      theme: oneOf(slot.theme, SEASONAL_THEMES, DEFAULT_THEME_SCHEDULE[index].theme),
    };
  }) as ThemeSchedule;
  return isValidThemeSchedule(schedule) ? schedule : DEFAULT_THEME_SCHEDULE.map((slot) => ({ ...slot })) as ThemeSchedule;
}

/** Valida campo a campo: valores desconhecidos ou corrompidos caem no padrão. */
export function sanitizePrefs(raw: unknown): UiPrefs {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_PREFS;
  return {
    showNames: bool(o.showNames, d.showNames),
    bubbles: oneOf(o.bubbles, ['all', 'important', 'none'] as const, d.bubbles),
    liveliness: oneOf(o.liveliness, ['calm', 'normal', 'lively'] as const, d.liveliness),
    // preferências antigas: o interruptor "dia e noite" desligado vira "sempre dia"
    daylight: oneOf(o.daylight, ['auto', 'day', 'night'] as const, o.dayNight === false ? 'day' : d.daylight),
    uiPalette: oneOf(o.uiPalette, ['midnight', 'forest', 'ember', 'high-contrast'] as const, d.uiPalette),
    theme: oneOf(o.theme, ['auto', ...SEASONAL_THEMES] as const, d.theme),
    holidayThemes: bool(o.holidayThemes, d.holidayThemes),
    themeSchedule: sanitizeThemeSchedule(o.themeSchedule),
    sound: bool(o.sound, d.sound),
    sounds: sanitizeSoundSettings(o.sounds),
    browserNotifications: bool(o.browserNotifications, d.browserNotifications),
    sidebarOpen: bool(o.sidebarOpen, d.sidebarOpen),
    feedOpen: bool(o.feedOpen, d.feedOpen),
    hiddenAccounts: Array.isArray(o.hiddenAccounts) ? o.hiddenAccounts.filter((x): x is string => typeof x === 'string').slice(0, 20) : [],
  };
}

export function loadPrefs(storage: StorageLike | null): UiPrefs {
  if (!storage) return { ...DEFAULT_PREFS };
  try {
    const raw = storage.getItem(PREFS_KEY);
    return sanitizePrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(storage: StorageLike | null, prefs: UiPrefs): void {
  if (!storage) return;
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Armazenamento cheio ou bloqueado (aba anônima): as preferências valem só nesta sessão.
  }
}

/** Parte das preferências que o mundo (canvas) consome. */
export function worldOptionsFrom(p: UiPrefs, includeAutomaticSettings = false): Partial<WorldOptions> {
  const options: Partial<WorldOptions> = { showNames: p.showNames, bubbles: p.bubbles, liveliness: p.liveliness, dayNight: p.daylight !== 'day', daylight: p.daylight, theme: p.theme };
  if (includeAutomaticSettings || p.themeSchedule.some((slot, index) => slot.start !== DEFAULT_THEME_SCHEDULE[index].start || slot.theme !== DEFAULT_THEME_SCHEDULE[index].theme)) {
    options.themeSchedule = p.themeSchedule;
  }
  if (includeAutomaticSettings || !p.holidayThemes) options.holidayThemes = p.holidayThemes;
  return options;
}

/** localStorage com proteção contra navegadores que lançam exceção ao acessá-lo. */
export function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Migração do nome antigo (CodeTown, até a 0.3.2): as chaves eram `codetown:prefs`,
 * `codetown:update-seen`, `codetown.wallets.v1`... e passaram a começar com `habblaud`.
 */
const LEGACY_NAME = 'codetown';
const LEGACY_PREFIXES = [`${LEGACY_NAME}:`, `${LEGACY_NAME}.`];
const NAME = 'habblaud';

type ListableStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

/**
 * Renomeia as chaves do nome antigo para quem atualiza não perder as preferências nem as moedinhas.
 * Roda no boot, antes de qualquer leitura. Se a chave nova já existe, ela vale e a antiga só é apagada.
 * Retorna quantas chaves copiou.
 */
export function migrateLegacyKeys(storage: ListableStorage | null): number {
  if (!storage) return 0;
  const legacy: string[] = [];
  try {
    // Lista antes de mexer: apagar durante a varredura muda os índices de key(i).
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && LEGACY_PREFIXES.some((p) => key.startsWith(p))) legacy.push(key);
    }
  } catch {
    return 0;
  }
  let copied = 0;
  for (const old of legacy) {
    try {
      const value = storage.getItem(old);
      const key = NAME + old.slice(LEGACY_NAME.length);
      if (value !== null && storage.getItem(key) === null) {
        storage.setItem(key, value);
        copied++;
      }
      // Só apaga depois de copiar: se a gravação falhar (cota cheia), a antiga fica para a próxima vez.
      storage.removeItem(old);
    } catch {
      // segue com as outras chaves
    }
  }
  return copied;
}
