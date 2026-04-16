const { app, BrowserWindow, dialog, shell } = require('electron');
const { execFileSync, spawn } = require('child_process');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const SERVER_START_TIMEOUT_MS = 15000;
const APP_ICON_PATH = path.join(__dirname, '..', 'public', 'favicon.ico');
const EXTERNAL_URL_PROTOCOLS = new Set(['http:', 'https:']);
const WINDOW_OPTIONS = {
  width: 1280,
  height: 900,
  minWidth: 960,
  minHeight: 640,
  autoHideMenuBar: true,
  icon: APP_ICON_PATH,
  show: false,
  title: 'Todo管理',
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false
  }
};

let mainWindow = null;
let serverProcess = null;
let serverUrl = null;
let isQuitting = false;

function isExternalNavigationUrl(targetUrl) {
  if (!serverUrl) {
    return false;
  }

  try {
    const target = new URL(targetUrl);
    const appOrigin = new URL(serverUrl).origin;

    return EXTERNAL_URL_PROTOCOLS.has(target.protocol) && target.origin !== appOrigin;
  } catch (error) {
    return false;
  }
}

function openExternalUrl(targetUrl) {
  if (!isExternalNavigationUrl(targetUrl)) {
    return false;
  }

  shell.openExternal(targetUrl).catch((error) => {
    dialog.showErrorBox('Todo管理', `外部リンクを開けませんでした。\n${error.message}`);
  });
  return true;
}

function resolveNodeExecutable() {
  const candidates = [
    process.env.npm_node_execpath,
    process.env.NODE_EXEC_PATH,
    process.env.ORIGINAL_NODE_PATH
  ].filter(Boolean);

  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles;
    if (programFiles) {
      candidates.push(path.join(programFiles, 'nodejs', 'node.exe'));
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const command = process.platform === 'win32' ? 'where.exe' : 'which';
    const output = execFileSync(command, ['node'], {
      encoding: 'utf8',
      windowsHide: true
    });
    const resolved = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    if (resolved) {
      return resolved;
    }
  } catch (error) {
    // Fall through to the descriptive error below.
  }

  throw new Error('Node.js 実行ファイルが見つかりませんでした。');
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const tempServer = net.createServer();

    tempServer.on('error', reject);
    tempServer.listen(0, HOST, () => {
      const address = tempServer.address();
      const port = address && typeof address === 'object' ? address.port : null;

      tempServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        if (!port) {
          reject(new Error('空きポートを取得できませんでした。'));
          return;
        }

        resolve(port);
      });
    });
  });
}

function waitForServer(url) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      if (!serverProcess) {
        reject(new Error('サーバープロセスが起動していません。'));
        return;
      }

      if (serverProcess.exitCode !== null) {
        reject(new Error(`サーバーが起動前に終了しました (code: ${serverProcess.exitCode})。`));
        return;
      }

      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });

      request.on('error', () => {
        if (Date.now() - startedAt >= SERVER_START_TIMEOUT_MS) {
          reject(new Error(`サーバーの起動待機が ${SERVER_START_TIMEOUT_MS}ms を超えました。`));
          return;
        }

        setTimeout(tryConnect, 250);
      });

      request.setTimeout(2000, () => {
        request.destroy();
      });
    };

    tryConnect();
  });
}

async function startServer() {
  if (serverProcess && serverUrl) {
    return serverUrl;
  }

  const port = await reservePort();
  const serverScriptPath = path.join(__dirname, '..', 'server.js');
  const cwd = path.join(__dirname, '..');
  const nodeExecutable = resolveNodeExecutable();

  serverUrl = `http://${HOST}:${port}`;
  serverProcess = spawn(
    nodeExecutable,
    [serverScriptPath, '--host', HOST, '--port', String(port)],
    {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    }
  );

  serverProcess.stdout.setEncoding('utf8');
  serverProcess.stderr.setEncoding('utf8');
  serverProcess.stdout.on('data', (chunk) => {
    process.stdout.write(`[server] ${chunk}`);
  });
  serverProcess.stderr.on('data', (chunk) => {
    process.stderr.write(`[server:error] ${chunk}`);
  });

  serverProcess.once('exit', (code, signal) => {
    const message = `サーバープロセスが終了しました (code: ${code ?? 'null'}, signal: ${signal ?? 'none'})。`;
    serverProcess = null;

    if (isQuitting) {
      return;
    }

    dialog.showErrorBox('Todo管理', message);
    app.quit();
  });

  await waitForServer(serverUrl);
  return serverUrl;
}

function createMainWindow(url) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  mainWindow = new BrowserWindow(WINDOW_OPTIONS);

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (openExternalUrl(targetUrl)) {
      return { action: 'deny' };
    }

    return { action: 'allow' };
  });

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (openExternalUrl(targetUrl)) {
      event.preventDefault();
    }
  });

  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function stopServer() {
  if (!serverProcess || serverProcess.killed) {
    return;
  }

  serverProcess.kill();
}

app.on('before-quit', () => {
  isQuitting = true;
  stopServer();
});

app.whenReady().then(async () => {
  try {
    const url = await startServer();
    createMainWindow(url);
  } catch (error) {
    dialog.showErrorBox(
      'Todo管理',
      `アプリを起動できませんでした。\n${error.message}`
    );
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && serverUrl) {
    createMainWindow(serverUrl);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
