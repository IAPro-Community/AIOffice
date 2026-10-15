import { describe, expect, it } from 'vitest';
import { LOGIN_CODE_LENGTH, LOGIN_CODE_PATTERN, LOGIN_CODE_TTL_MS, loginPage, RemoteLoginCodes } from './remote';

describe('login remoto por Cloudflare', () => {
  it('pede um código de uso único e preserva o alerta de hostname temporário', () => {
    const html = loginPage();

    expect(html).toContain('name="code" type="text" inputmode="text" autocomplete="one-time-code"');
    expect(html).toContain('minlength="6" maxlength="6"');
    expect(html).toMatch(/<div class="field-label-row">\s*<label for="c">[\s\S]*?<\/label>\s*<button type="button" class="paste-btn"/);
    expect(html).toContain('Acesse seu escritório com o código temporário gerado no painel local do AIOffice.');
    expect(html).toContain('Este link usa um endereço temporário do Cloudflare.');
    expect(html).toContain('não prossiga nem informe o código.');
    expect(html).not.toMatch(/<input[^>]*\sdisabled(?:\s|>)/i);
    expect(html).not.toContain('current-password');
  });

  it('emite um código alfanumérico de seis caracteres, de uso único e válido por cinco minutos', () => {
    let now = 1_000;
    const codes = new RemoteLoginCodes(() => now);
    const issued = codes.issue();

    expect(LOGIN_CODE_LENGTH).toBe(6);
    expect(issued.code).toMatch(LOGIN_CODE_PATTERN);
    expect(issued.expiresAt).toBe(now + LOGIN_CODE_TTL_MS);
    expect(codes.consume(issued.code.toLowerCase())).toBe(true);
    expect(codes.consume(issued.code)).toBe(false);

    const expiring = codes.issue();
    now += LOGIN_CODE_TTL_MS;
    expect(codes.consume(expiring.code)).toBe(false);
  });
});
