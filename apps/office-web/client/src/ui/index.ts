// Interface do Habblaud (painéis DOM sobre o canvas do escritório).
// Recebe o OfficeStore (dados) e o WorldApi (canvas) e monta: barra superior com uso por conta,
// barra lateral, gaveta de detalhes, feed, avisos, configurações, ajuda e estados de carregamento/vazio.
// DOM incremental: os snapshots (até ~5/s) só marcam a UI como "suja"; tudo é reconciliado uma vez por quadro.
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/pixelify-sans/700.css';
import './styles.css';

import type { OfficeStore } from '../net/store';
import type { Selection, WorldApi } from '../world/api';
import type { PanelName, TerminalRouter, UiComponent, UiContext } from './context';
import { DayLauncher } from './daystats-launcher';
import { RoomRenamer } from './roomrename';
import { h } from './dom';
import { Drawer } from './drawer';
import { FeedPanel } from './feed';
import { HelpDialog } from './help';
import { HistoryPopover } from './history';
import { HoverTip } from './hovertip';
import { hasRunningShells } from './model';
import { hasCodexPermission } from './provider';
import { Notifier } from './notify';
import { ConnectionBanner, EmptyState, Splash } from './overlays';
import { focusPermission, nextPermissionAgent } from './permission';
import { loadPrefs, safeLocalStorage, savePrefs, worldOptionsFrom, type UiPrefs } from './prefs';
import { SettingsPopover } from './settings';
import { Sidebar } from './sidebar';
import { SoundControl } from './sound';
import { TERMINAL_UNAVAILABLE_HINT, TerminalPanel } from './terminal';
import { PtyPanel } from './pty';
import { TimelapsePlayer } from './timelapse';
import { Toasts } from './toasts';
import { UpdateToaster } from './version';
import { TopBar } from './topbar';
import { UpdateBanner } from './update';
import { FreeArea } from './viewport';
import { tr } from '../../../shared/i18n';

/** Relógio dos tempos relativos ("há 5 s"). */
const CLOCK_MS = 5_000;
/** Relógio do cronômetro dos shells ("12:31") e do prazo dos pedidos do Codex, ligado só enquanto há um dos dois. */
const SHELL_CLOCK_MS = 1_000;
const NARROW_QUERY = '(max-width: 900px)';

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
}

export function createUI(root: HTMLElement, store: OfficeStore, world: WorldApi): void {
  const storage = safeLocalStorage();
  let prefs: UiPrefs = loadPrefs(storage);
  let selection: Selection = world.getSelection();
  let skew = 0;
  const narrowMq = typeof matchMedia === 'function' ? matchMedia(NARROW_QUERY) : null;
  const panels: Record<PanelName, boolean> = {
    sidebar: narrowMq?.matches ? false : prefs.sidebarOpen,
    feed: narrowMq?.matches ? false : prefs.feedOpen,
  };

  const live = h('div', { class: 'ui-sr', role: 'status', attrs: { 'aria-live': 'polite' } });

  let topbar: TopBar;
  let sidebar: Sidebar;
  let drawer: Drawer;
  let settings: SettingsPopover;
  let help: HelpDialog;
  let area: FreeArea;
  let timelapse: TimelapsePlayer;
  /** A seleção em curso partiu da UI (lista, feed, aviso...), não de um clique no canvas. */
  let uiSelecting = false;

  const ctx: UiContext = {
    store,
    world,
    root,
    get prefs() {
      return prefs;
    },
    updatePrefs(patch) {
      prefs = { ...prefs, ...patch };
      savePrefs(storage, prefs);
      world.setOptions(worldOptionsFrom(prefs));
      invalidate();
    },
    now: () => timelapse?.replayTime ?? Date.now() + skew,
    account: (id) => store.snapshot?.accounts.find((a) => a.id === id),
    agent: (id) => store.agent(id),
    selection: () => selection,
    select(sel, opts) {
      if (sel && opts?.focus) area.setIntent(sel);
      else area.clearIntent();
      // A gaveta passa a contar na área livre ANTES do foco: o mundo centraliza já na parte visível.
      const prev = selection;
      selection = sel;
      area.selectingFromUi();
      applyLayout({ refocus: false });
      uiSelecting = true;
      try {
        world.select(sel, opts);
      } catch (err) {
        selection = prev;
        applyLayout();
        throw err;
      } finally {
        uiSelecting = false;
      }
    },
    focusSelection() {
      if (selection) ctx.select(selection, { focus: true });
    },
    camera(action) {
      area.clearIntent();
      if (action === 'overview') world.overview();
      else world.zoomBy(action === 'zoomIn' ? 1.25 : 1 / 1.25);
    },
    invalidate: () => invalidate(),
    togglePanel(name, open) {
      const next = open ?? !panels[name];
      if (panels[name] === next) return;
      panels[name] = next;
      if (!ctx.isNarrow()) ctx.updatePrefs(name === 'sidebar' ? { sidebarOpen: next } : { feedOpen: next });
      applyLayout();
      invalidate();
    },
    isPanelOpen: (name) => panels[name],
    isNarrow: () => !!narrowMq?.matches,
    announce(text) {
      live.textContent = '';
      requestAnimationFrame(() => (live.textContent = text));
    },
    focusSearch() {
      if (!panels.sidebar) ctx.togglePanel('sidebar', true);
      requestAnimationFrame(() => sidebar.focusSearch());
    },
    openHelp: (section) => help.open(section),
    toggleSettings: () => settings.toggle(topbar.settingsBtn),
    openAbout: () => settings.showAbout(topbar.settingsBtn),
    toggleTimelapse() {
      // O terminal mostra a conversa de agora: não combina com o dia reproduzido.
      if (!timelapse.isOpen && terminal.isOpen) terminal.close();
      timelapse.toggle();
    },
    isTimelapseOpen: () => timelapse.isOpen,
  };

  // ---------------------------------------------------------------- componentes
  const sound = new SoundControl(ctx);
  const notifier = new Notifier(ctx, sound.board);
  topbar = new TopBar(ctx);
  sidebar = new Sidebar(ctx);
  // Terminal interativo (Claude Code de verdade, dentro do navegador): abrir, assumir e encerrar sessões.
  const pty = new PtyPanel(ctx);
  const terminal = new TerminalPanel(ctx, pty);
  // Histórico de sessões (terminal): botão no grupo dos painéis da barra superior.
  const history = new HistoryPopover(ctx, terminal);
  topbar.panelGroup.prepend(history.button);
  // Terminal do agente: o interativo se a sessão roda aqui; senão o de leitura, com "Assumir daqui" para
  // continuar nesta janela (sem o de leitura, o interativo mostra o aviso de "em outro terminal").
  pty.onShow = () => terminal.close();
  const router: TerminalRouter = {
    get openAgentId() {
      return pty.isOpen ? pty.agentId : terminal.agentId;
    },
    get available() {
      return pty.enabled || (!!store.snapshot?.meta.terminal && !store.replaying);
    },
    interactive: (id) => !!pty.ptyOf(id),
    get interactiveEnabled() {
      return pty.enabled;
    },
    newSession: (cwd, account) => pty.newSession(cwd, account),
    open(id, opener) {
      const readOnly = !!store.snapshot?.meta.terminal && !store.replaying;
      if (pty.ptyOf(id) || (pty.enabled && !readOnly && ctx.agent(id)?.kind === 'main')) pty.openAgent(id);
      else {
        pty.close();
        terminal.open(id, opener);
      }
    },
    toggle(id, opener) {
      if (router.openAgentId === id) {
        pty.close();
        terminal.close();
      } else router.open(id, opener);
    },
  };
  ctx.terminals = router;
  drawer = new Drawer(ctx, terminal, pty);
  const feed = new FeedPanel(ctx);
  const toasts = new Toasts(ctx);
  const updateToaster = new UpdateToaster(ctx, (n) => toasts.push(n));
  settings = new SettingsPopover(ctx, notifier, sound);
  help = new HelpDialog();
  const day = new DayLauncher(ctx, (el) => root.append(el));
  topbar.addPanelButton(day.button);
  // Botão direito numa sala (lista lateral ou escritório): renomear.
  const renamer = new RoomRenamer(ctx);
  ctx.renameRoom = (id, at) => renamer.open(id, at);
  world.onRoomContextMenu?.((id, at) => renamer.open(id, at));
  const empty = new EmptyState(ctx);
  const banner = new ConnectionBanner(ctx);
  const update = new UpdateBanner(store);
  const tip = new HoverTip(ctx);
  const splash = new Splash(ctx);
  timelapse = new TimelapsePlayer(ctx);
  const scrim = h('div', { class: 'ui-scrim', attrs: { 'aria-hidden': 'true' }, on: { click: () => ctx.togglePanel('sidebar', false) } });

  root.classList.add('ui-root');
  root.append(timelapse.vignette, topbar.el, sidebar.el, scrim, feed.el, drawer.el, terminal.el, pty.el, timelapse.el, timelapse.badge, toasts.el, banner.el, update.el, empty.el, tip.el, settings.el, history.el, help.el, renamer.el, live, splash.el);
  area = new FreeArea(world, { root, topbar: topbar.el, sidebar: sidebar.el, drawer: drawer.el, feed: feed.el }, () => ({
    sidebar: panels.sidebar,
    feed: panels.feed,
    drawer: selection !== null && !drawer.floating,
    narrow: ctx.isNarrow(),
  }));
  drawer.onLayoutChange = () => applyLayout();

  const components: UiComponent[] = [topbar, sidebar, drawer, terminal, pty, history, feed, toasts, settings, empty, banner, tip, notifier, splash, timelapse, sound, day, updateToaster];

  // ---------------------------------------------------------------- renderização agrupada por quadro
  let rafId = 0;
  let hiddenTimer: ReturnType<typeof setTimeout> | null = null;

  function renderAll(): void {
    rafId = 0;
    for (const c of components) {
      try {
        c.render();
      } catch (err) {
        console.error('[ui] falha ao renderizar', c.constructor.name, err);
      }
    }
  }

  function invalidate(): void {
    if (document.hidden) {
      // Com a aba oculta o navegador congela o rAF: mantém só título e alertas em dia.
      hiddenTimer ??= setTimeout(() => {
        hiddenTimer = null;
        notifier.render();
        toasts.render();
      }, 500);
      return;
    }
    if (!rafId) rafId = requestAnimationFrame(renderAll);
  }

  /** Aplica as classes de layout e informa ao mundo a área livre (sem esperar as transições dos painéis). */
  function applyLayout(opts: { refocus?: boolean } = {}): void {
    root.classList.toggle('has-sidebar', panels.sidebar);
    root.classList.toggle('has-feed', panels.feed);
    root.classList.toggle('has-drawer', selection !== null && !drawer.floating);
    root.classList.toggle('is-narrow', ctx.isNarrow());
    area.sync(opts);
  }

  // ---------------------------------------------------------------- eventos
  store.on('snapshot', (snap) => {
    // Ao vivo, o "agora" da interface segue o relógio do servidor (o aparelho pode estar adiantado ou atrasado).
    // No timelapse, quem manda é o instante reproduzido pelo player (parado quando pausado).
    if (store.connection === 'open' && !store.replaying) skew = snap.serverTime - Date.now();
    invalidate();
  });
  store.on('connection', () => invalidate());
  world.onSelect((sel) => {
    const prev = selection;
    selection = sel;
    // Clique no canvas (ou agente que saiu): a gaveta espera a janela do duplo clique antes de mexer na câmera.
    if (!uiSelecting) area.selectionChangedExternally(prev, sel);
    applyLayout(uiSelecting ? { refocus: false } : {});
    invalidate();
  });
  narrowMq?.addEventListener('change', (e) => {
    if (e.matches) {
      panels.sidebar = false;
      panels.feed = false;
    } else {
      panels.sidebar = prefs.sidebarOpen;
      panels.feed = prefs.feedOpen;
    }
    applyLayout();
    invalidate();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) invalidate();
  });
  setInterval(() => {
    if (!document.hidden) invalidate();
  }, CLOCK_MS);
  setInterval(() => {
    // Shells rodando (cronômetro) ou pedido do Codex esperando (prazo de segundos).
    if (!document.hidden && (hasRunningShells(store.snapshot) || hasCodexPermission(store.snapshot))) invalidate();
  }, SHELL_CLOCK_MS);

  addEventListener('keydown', (e) => onKey(e));

  function onKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (help.isOpen || settings.isOpen || history.isOpen) return; // diálogo/popover tratam o próprio Esc
      // O terminal flutua sobre tudo: fecha primeiro (a busca dele, depois ele; a gaveta continua aberta).
      if (terminal.isOpen) {
        terminal.escape();
        e.preventDefault();
      } else if (ctx.isNarrow() && panels.sidebar) {
        ctx.togglePanel('sidebar', false);
        e.preventDefault();
      } else if (selection) {
        ctx.select(null);
        e.preventDefault();
      }
      return;
    }
    if (isTypingTarget(e.target) || help.isOpen) return;
    switch (e.key) {
      case '/':
        e.preventDefault();
        ctx.focusSearch();
        break;
      case '?':
        e.preventDefault();
        help.open();
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        if (selection?.type === 'agent') drawer.toggleFollow();
        else ctx.announce(tr('Selecione um agente para seguir.'));
        break;
      case 't':
      case 'T':
        e.preventDefault();
        toggleTerminal();
        break;
      case 'l':
      case 'L':
        if (store.mock) break;
        e.preventDefault();
        ctx.toggleTimelapse();
        break;
      case 'p':
      case 'P': {
        // Próximo pedido de permissão ou pergunta para responder pelo escritório (só leva até ele: nunca aprova).
        e.preventDefault();
        const next = nextPermissionAgent(store.snapshot?.agents ?? [], selection?.type === 'agent' ? selection.id : undefined);
        if (next) focusPermission(ctx, next.id);
        else ctx.announce(tr('Nenhum pedido de permissão ou pergunta para responder agora.'));
        break;
      }
      case 'o':
      case 'O':
        e.preventDefault();
        ctx.camera('overview');
        break;
      case 'm':
      case 'M':
        e.preventDefault();
        day.toggle();
        break;
      case '[':
        e.preventDefault();
        ctx.togglePanel('sidebar');
        break;
      case ']':
        e.preventDefault();
        ctx.togglePanel('feed');
        break;
    }
  }

  /**
   * Atalho T: abre a janela de terminal do agente selecionado (ver `router`) ou fecha a que estiver aberta.
   */
  function toggleTerminal(): void {
    const id = selection?.type === 'agent' ? selection.id : null;
    if (id !== null && pty.enabled && ctx.agent(id)?.kind === 'main') return router.toggle(id);
    if (id === null && pty.isOpen) return pty.close();
    if (terminal.isOpen && (id === null || terminal.agentId === id)) terminal.close();
    else if (id === null) ctx.announce(tr('Selecione um agente para abrir o terminal.'));
    else if (!store.snapshot?.meta.terminal) ctx.announce(`${TERMINAL_UNAVAILABLE_HINT}.`);
    else if (!ctx.agent(id)) ctx.announce(tr('O agente já saiu do escritório.'));
    else terminal.open(id);
  }

  // ---------------------------------------------------------------- início
  world.setOptions(worldOptionsFrom(prefs));
  applyLayout();
  renderAll();
}
