// Instruções para baixar a extensão e carregá-la manualmente no Chrome.
import { h } from './dom';
import { tr } from '../../../shared/i18n';

const CHROME_EXTENSION_ZIP_URL = 'https://github.com/IAPro-Community/AIOffice/releases/latest/download/AIOffice-Chrome-Extension.zip';
const AIOFFICE_DESKTOP_WINDOWS_URL = 'https://github.com/IAPro-Community/AIOffice/releases/latest/download/AIOffice-Setup.exe';
const CHROME_INSTALL_GUIDE_URL = 'https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world/#load-unpacked';
const CHROME_EXTENSIONS_PAGE = 'chrome://extensions';

export class ChromeExtensionSettingsGroup {
  readonly el: HTMLElement;
  private copyStatus: HTMLElement;

  constructor() {
    const desktopLink = h('a', {
      class: 'ui-link-btn',
      text: tr('Baixar AIOffice Desktop para Windows'),
      attrs: { href: AIOFFICE_DESKTOP_WINDOWS_URL, target: '_blank', rel: 'noopener noreferrer' },
    });
    const extensionLink = h('a', {
      class: 'ui-btn ui-btn--sm ui-btn--primary ui-chrome-extension__download',
      text: tr('Baixar extensão (.zip)'),
      attrs: { href: CHROME_EXTENSION_ZIP_URL, target: '_blank', rel: 'noopener noreferrer' },
    });
    const chromeAddress = h('code', { class: 'ui-chrome-extension__address', text: CHROME_EXTENSIONS_PAGE });
    const copyButton = h('button', {
      class: 'ui-btn ui-btn--sm',
      type: 'button',
      text: tr('Copiar endereço'),
      attrs: { 'aria-label': tr('Copiar endereço chrome://extensions') },
      on: { click: () => void this.copyChromeAddress() },
    });
    this.copyStatus = h('span', { class: 'ui-set__hint', role: 'status', attrs: { 'aria-live': 'polite' } });

    const officialGuide = h('a', {
      class: 'ui-link-btn',
      text: tr('Ver guia oficial do Chrome'),
      attrs: { href: CHROME_INSTALL_GUIDE_URL, target: '_blank', rel: 'noopener noreferrer' },
    });

    this.el = h(
      'section',
      { class: 'ui-set-group ui-chrome-extension', attrs: { 'aria-labelledby': 'ui-chrome-extension-heading' } },
      h('h3', { text: tr('Extensão para Chrome'), attrs: { id: 'ui-chrome-extension-heading' } }),
      h('p', { class: 'ui-set__hint ui-chrome-extension__intro', text: tr('Acompanhe os agentes no painel lateral do Chrome.') }),
      h(
        'div',
        { class: 'ui-chrome-extension__desktop' },
        h('strong', { text: tr('Primeiro, instale o AIOffice Desktop no Windows.') }),
        h('p', { class: 'ui-set__hint', text: tr('Ele instala o conector local que a extensão usa para acompanhar agentes e iniciar o serviço quando necessário.') }),
        desktopLink,
      ),
      extensionLink,
      h('p', { class: 'ui-set__hint ui-chrome-extension__note', text: tr('Instalação em modo de desenvolvedor: o Chrome não carrega a extensão diretamente do ZIP.') }),
      h('h4', { class: 'ui-chrome-extension__guide-title', text: tr('Como instalar no Chrome') }),
      h(
        'ol',
        { class: 'ui-chrome-extension__steps' },
        h('li', { text: tr('Baixe o ZIP pelo botão acima e extraia para uma pasta permanente.') }),
        h(
          'li',
          {},
          h('span', { text: tr('No Chrome, abra este endereço:') }),
          h('div', { class: 'ui-chrome-extension__address-row' }, chromeAddress, copyButton),
          this.copyStatus,
        ),
        h('li', { text: tr('Ative o Modo do desenvolvedor na página Extensões.') }),
        h('li', { text: tr('Clique em Carregar sem compactação e escolha a pasta extraída que contém manifest.json.') }),
        h('li', { text: tr('Fixe o AIOffice na barra do Chrome e abra o painel lateral.') }),
      ),
      officialGuide,
    );
  }

  private async copyChromeAddress(): Promise<void> {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(CHROME_EXTENSIONS_PAGE);
      this.copyStatus.textContent = tr('Endereço copiado.');
    } catch {
      this.copyStatus.textContent = tr('Não foi possível copiar. Digite chrome://extensions na barra do Chrome.');
    }
  }
}
