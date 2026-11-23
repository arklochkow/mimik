import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { app, BrowserWindow } from 'electron';

const TAG = 'MIMIK_STORAGE_CHECK ';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

function line(result: CheckResult): void {
  process.stdout.write(`${result.ok ? 'ok  ' : 'FAIL'} ${result.name.padEnd(26)} ${result.detail}\n`);
}

function runRole(role: 'write' | 'read', guideId: string): Promise<CheckResult[]> {
  const win = new BrowserWindow({ show: false });

  return new Promise((resolve) => {
    const timer = setTimeout(
      () => finish([{ name: `${role} window`, ok: false, detail: 'timed out after 20s' }]),
      20_000,
    );

    function finish(results: CheckResult[]): void {
      clearTimeout(timer);
      if (!win.isDestroyed()) win.destroy();
      resolve(results);
    }

    win.webContents.on('console-message', (_event, _level, message) => {
      if (message.startsWith(TAG)) finish(JSON.parse(message.slice(TAG.length)));
    });
    win.webContents.on('did-fail-load', (_e, code, description) =>
      finish([{ name: `${role} window`, ok: false, detail: `load failed (${code}): ${description}` }]),
    );
    win.webContents.on('render-process-gone', (_e, details) =>
      finish([{ name: `${role} window`, ok: false, detail: `renderer gone: ${details.reason}` }]),
    );
    win.loadFile(join(__dirname, '../renderer/check-storage.html'), { hash: `${role}:${guideId}` });
  });
}

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const guideId = randomUUID();
  const results = [...(await runRole('write', guideId)), ...(await runRole('read', guideId))];
  results.forEach(line);

  const failures = results.filter((r) => !r.ok).length;
  process.stdout.write(`\n${failures === 0 ? 'storage layer carries over unchanged' : `${failures} failure(s)`}\n`);
  app.exit(failures === 0 ? 0 : 1);
});
