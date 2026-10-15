const { app, dialog } = require('electron');
const { appendFileSync, mkdirSync } = require('node:fs');
const { isAbsolute, join, resolve } = require('node:path');

const productName = 'AIOffice';
app.setName(productName);

const smokeUserData = process.env.AIOFFICE_DESKTOP_SMOKE === '1'
  && isAbsolute(process.env.AIOFFICE_DESKTOP_SMOKE_USERDATA || '')
  ? resolve(process.env.AIOFFICE_DESKTOP_SMOKE_USERDATA)
  : undefined;
app.setPath('userData', smokeUserData || join(app.getPath('appData'), app.isPackaged ? productName : `${productName}-dev`));

const userData = app.getPath('userData');
const logFile = join(userData, 'aioffice.log');

function reportBootstrapFailure(error) {
  const detail = error instanceof Error ? error.stack || error.message : String(error);
  const line = `${new Date().toISOString()} ERROR Desktop bootstrap could not load the main process: ${detail}\n`;
  try {
    mkdirSync(userData, { recursive: true, mode: 0o700 });
    appendFileSync(logFile, line, { encoding: 'utf8', mode: 0o600 });
  } catch (logError) {
    console.error('AIOffice could not write its bootstrap diagnostic log.', logError);
  }
  console.error(line.trimEnd());
  if (process.env.AIOFFICE_DESKTOP_SMOKE === '1') {
    process.exitCode = 1;
    app.quit();
    return;
  }
  dialog.showErrorBox(
    'AIOffice não iniciou',
    `O processo principal do AIOffice não conseguiu carregar.\n\nAbra o log para ver a causa:\n${logFile}`,
  );
  app.quit();
}

try {
  mkdirSync(userData, { recursive: true, mode: 0o700 });
  import('./main.mjs').catch(reportBootstrapFailure);
} catch (error) {
  reportBootstrapFailure(error);
}
