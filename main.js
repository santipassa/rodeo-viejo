// Proceso principal de Electron: arranca el server local y abre la ventana.
import { app, BrowserWindow, shell, Menu } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Guardamos el historial en la carpeta de datos del usuario (persistente y con permisos de escritura).
process.env.RODEOVIEJO_DB = join(app.getPath('userData'), 'rodeoviejo.db');

let win;

async function createWindow() {
  // Arrancamos el motor HTTP (import dinámico: así RODEOVIEJO_DB ya está seteado).
  const { ready } = await import('./server.js');
  const port = await ready;

  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#0e1116',
    title: 'RodeoViejo',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  win.loadURL(`http://localhost:${port}`);

  // Los links externos abren en el navegador del sistema, no dentro de la app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Ejecuta una función del renderer (definida en app.js) en la ventana con foco.
function runInRenderer(js) {
  const w = BrowserWindow.getFocusedWindow();
  if (w) w.webContents.executeJavaScript(js).catch(() => {});
}

// Menú con atajos útiles. Incluye el manejo de pestañas (Cmd+T / Cmd+W).
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Pestañas',
      submenu: [
        { label: 'Nueva pestaña', accelerator: 'CmdOrCtrl+T', click: () => runInRenderer('window.__pgNewTab && window.__pgNewTab()') },
        { label: 'Cerrar pestaña', accelerator: 'CmdOrCtrl+W', click: () => runInRenderer('window.__pgCloseTab && window.__pgCloseTab()') },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    // Menú de ventana propio: SIN "Cerrar ventana" en Cmd+W (lo usamos para pestañas).
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { label: 'Cerrar ventana', accelerator: 'CmdOrCtrl+Shift+W', role: 'close' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
