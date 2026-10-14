// Compatibilidade com comandos antigos: o acesso móvel é gerenciado pela interface.
// Este script não lê nem altera credenciais, certificados ou configuração de rede.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function main(argv = process.argv.slice(2)): Promise<void> {
  console.log('O assistente CLI de acesso remoto foi desativado.');
  console.log('No AIOffice local, abra Configurações → Acesso pelo celular.');
  if (argv.includes('--off')) {
    console.log('Para encerrar o túnel ativo, use o botão Parar nesse painel.');
    console.log('Este comando não para o túnel nem altera a senha mestra.');
    return;
  }
  console.log('Instale cloudflared e deixe o executável disponível no PATH do AIOffice.');
  console.log('Cadastre uma senha mestra no painel; a configuração inicia um Quick Tunnel Cloudflare.');
  console.log('Use Iniciar, Parar e Copiar link no painel; no celular, abra o link e entre com a senha mestra.');
  console.log('O túnel nunca inicia automaticamente ao ligar o servidor.');
  console.log('Os argumentos antigos são ignorados; nenhuma credencial, CA ou acesso LAN/VPN foi alterado.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
