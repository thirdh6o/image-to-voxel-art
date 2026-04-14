import { app, BrowserWindow } from 'electron';
import { startServer } from './server.mjs';

let mainWindow = null;
let appServer = null;

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 860,
    minWidth: 980,
    minHeight: 720,
    backgroundColor: '#fbfbf6',
    title: 'Voxel Workbench',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.loadURL(url);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  appServer = await startServer({ port: 0 });
  createWindow(appServer.url);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(appServer.url);
    }
  });
}).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (appServer?.server) {
    await new Promise((resolve) => appServer.server.close(resolve));
  }
});
