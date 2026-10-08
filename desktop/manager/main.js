'use strict';

/**
 * CLEANFINE Менеджер — десктопное окно над веб-админкой (решение владельца
 * 08.10.2026: не переносить 30 тыс. строк админки на Flutter, а дать менеджеру
 * нативное окно с тем же сайтом). Одна обёртка для macOS и Windows.
 *
 * Что делает обёртка, чего нет у вкладки браузера:
 *  - своё приложение в Dock/панели задач с иконкой CLEANFINE и названием;
 *  - сессия (localStorage админки) живёт в userData приложения — вход
 *    сохраняется между запусками, пока не истёк refresh-токен;
 *  - внешние ссылки (не cleanfine.ru) открываются в системном браузере;
 *  - меню по-русски: перезагрузить, назад, масштаб, портал заказчика.
 *
 * Адрес сервера — переменная окружения CLEANFINE_URL (по умолчанию прод);
 * для локального стенда: `npm run start:local` (http://localhost:5175).
 * Автовход (только личные сборки!): CLEANFINE_AUTOLOGIN="admin:admin123" —
 * админка поддерживает `/login?email=…&password=…` (лончеры с рабочего стола).
 */

const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('node:path');

const BASE_URL = (process.env.CLEANFINE_URL || 'https://cleanfine.ru').replace(/\/+$/, '');
const AUTOLOGIN = process.env.CLEANFINE_AUTOLOGIN || '';

/** Внутренние адреса: сама админка, портал и всё под тем же хостом. */
function isInternal(url) {
  try {
    const target = new URL(url);
    const base = new URL(BASE_URL);
    return target.host === base.host;
  } catch {
    return false;
  }
}

function startUrl() {
  if (!AUTOLOGIN.includes(':')) return `${BASE_URL}/`;
  const [email, ...rest] = AUTOLOGIN.split(':');
  const password = rest.join(':');
  return `${BASE_URL}/login?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: 'CLEANFINE Менеджер',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#F3F4F6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  // Ссылки «в новое окно» (target=_blank): свои — в этом же окне, чужие — в браузере.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) {
      mainWindow.loadURL(url);
    } else {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isInternal(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Заголовок окна остаётся нашим, а не <title> страницы.
  mainWindow.on('page-title-updated', (event) => event.preventDefault());

  mainWindow.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3: прервано самим переходом
    dialog
      .showMessageBox(mainWindow, {
        type: 'error',
        title: 'CLEANFINE Менеджер',
        message: 'Не удалось открыть админ-панель',
        detail: `${url}\n${description} (${code})\n\nПроверьте интернет и повторите.`,
        buttons: ['Повторить', 'Закрыть'],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) mainWindow.loadURL(startUrl());
      });
  });

  mainWindow.loadURL(startUrl());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about', label: 'О программе CLEANFINE Менеджер' },
              { type: 'separator' },
              { role: 'hide', label: 'Скрыть' },
              { role: 'hideOthers', label: 'Скрыть остальные' },
              { role: 'unhide', label: 'Показать все' },
              { type: 'separator' },
              { role: 'quit', label: 'Завершить' },
            ],
          },
        ]
      : []),
    {
      label: 'Файл',
      submenu: [
        {
          label: 'Админ-панель',
          accelerator: 'CmdOrCtrl+1',
          click: () => mainWindow?.loadURL(`${BASE_URL}/`),
        },
        {
          label: 'Портал заказчика',
          accelerator: 'CmdOrCtrl+2',
          click: () => mainWindow?.loadURL(`${BASE_URL}/client/`),
        },
        { type: 'separator' },
        {
          label: 'Выйти из учётной записи (очистить сессию)',
          click: async () => {
            if (!mainWindow) return;
            await mainWindow.webContents.session.clearStorageData();
            mainWindow.loadURL(`${BASE_URL}/login`);
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'Закрыть окно' } : { role: 'quit', label: 'Выход' },
      ],
    },
    {
      label: 'Правка',
      submenu: [
        { role: 'undo', label: 'Отменить' },
        { role: 'redo', label: 'Повторить' },
        { type: 'separator' },
        { role: 'cut', label: 'Вырезать' },
        { role: 'copy', label: 'Копировать' },
        { role: 'paste', label: 'Вставить' },
        { role: 'selectAll', label: 'Выделить всё' },
      ],
    },
    {
      label: 'Вид',
      submenu: [
        { role: 'reload', label: 'Перезагрузить' },
        { role: 'forceReload', label: 'Перезагрузить без кэша' },
        { type: 'separator' },
        {
          label: 'Назад',
          accelerator: isMac ? 'Cmd+[' : 'Alt+Left',
          click: () => {
            if (mainWindow?.webContents.canGoBack()) mainWindow.webContents.goBack();
          },
        },
        {
          label: 'Вперёд',
          accelerator: isMac ? 'Cmd+]' : 'Alt+Right',
          click: () => {
            if (mainWindow?.webContents.canGoForward()) mainWindow.webContents.goForward();
          },
        },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Обычный масштаб' },
        { role: 'zoomIn', label: 'Увеличить' },
        { role: 'zoomOut', label: 'Уменьшить' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Во весь экран' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Инструменты разработчика' },
      ],
    },
    {
      label: 'Окно',
      submenu: [
        { role: 'minimize', label: 'Свернуть' },
        { role: 'zoom', label: 'Масштабировать' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front', label: 'Все окна на передний план' }] : []),
      ],
    },
    {
      label: 'Справка',
      submenu: [
        {
          label: 'Открыть cleanfine.ru в браузере',
          click: () => shell.openExternal(`${BASE_URL}/`),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Одно окно на пользователя: повторный запуск поднимает существующее.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

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
}
