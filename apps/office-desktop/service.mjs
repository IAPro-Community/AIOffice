import { pathToFileURL } from 'node:url';

const serverEntry = process.argv[2];
if (!serverEntry) throw new Error('AIOffice local server entry was not provided.');

process.parentPort?.on('message', (event) => {
  if (event.data?.type === 'shutdown') process.emit('SIGTERM');
});

await import(pathToFileURL(serverEntry).href);
