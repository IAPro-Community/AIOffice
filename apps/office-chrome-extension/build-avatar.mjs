import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const extensionDir = path.dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [path.join(extensionDir, 'avatar-renderer-entry.ts')],
  outfile: path.join(extensionDir, 'avatar-renderer.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  minify: true,
  legalComments: 'none',
});
console.log('Renderer de personagens do AIOffice gerado para a extensão.');
