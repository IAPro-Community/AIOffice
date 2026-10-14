// Avisa quando o servidor passa a servir outro build. A atualização do estado ocorre em background;
// a página só recarrega se a pessoa clicar no botão.
import type { OfficeStore } from '../net/store';
import { h, setHidden, setText } from './dom';
import { tr } from '../../../shared/i18n';

export class UpdateBanner {
  readonly el: HTMLElement;
  private text: HTMLElement;

  constructor(store: OfficeStore, private reload: () => void = () => location.reload()) {
    this.text = h('span');
    const now = h('button', { class: 'ui-btn ui-btn--sm', type: 'button', text: tr('Recarregar agora'), on: { click: () => this.reload() } });
    const later = h('button', { class: 'ui-btn ui-btn--sm', type: 'button', text: tr('Depois'), on: { click: () => this.dismiss() } });
    this.el = h(
      'div',
      { class: 'ui-banner ui-banner--update', role: 'status', hidden: true },
      h('span', { class: 'ui-banner__dot', attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'ui-banner__text' }, this.text),
      now,
      later,
    );
    store.on('update', () => this.show());
  }

  private show(): void {
    setHidden(this.el, false);
    setText(this.text, tr('O AIOffice foi atualizado. Recarregue quando quiser para carregar a nova versão.'));
  }

  private dismiss(): void {
    setHidden(this.el, true);
  }
}
