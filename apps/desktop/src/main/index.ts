import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { APP_NAME } from '@moekoder/shared';

const createWindow = (): void => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0b1224',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'shell.html'));
};

app.whenReady().then(() => {
  app.setName(APP_NAME);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
