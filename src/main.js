import { app, BrowserWindow, BrowserView, ipcMain, nativeTheme, Menu, nativeImage, shell, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import { t } from './i18n/index.js'; 

if (started) app.quit();

app.setAppUserModelId('com.multiclaude.app');

const START_URL = 'https://claude.ai';
const APP_HOSTS = ['claude.ai', 'claude.com', 'anthropic.com'];
const AUTH_HOSTS = ['accounts.google.com', 'accounts.youtube.com', 'appleid.apple.com', 'idmsa.apple.com'];
// Derived from the bundled Chromium so UA and client hints stay consistent
const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome.split('.')[0]}.0.0.0 Safari/537.36`;

const hostIn = (url, list) => {
  try {
    const h = new URL(url).hostname;
    return list.some(d => h === d || h.endsWith('.' + d));
  } catch { return false; }
};

let mainWindow;
let tabs = [];
let activeTabId = null;
let sidebarWidth = 0;

let isQuitting = false; 

const TAB_BAR_HEIGHT = 40;
const dataPath = path.join(app.getPath('userData'), 'tabs.json');
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

const TAB_COLORS = [
  { name: 'Default', value: null },
  { name: 'Red', value: '#dc2626' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Amber', value: '#d97706' },
  { name: 'Green', value: '#16a34a' },
  { name: 'Teal', value: '#0d9488' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Indigo', value: '#4f46e5' },
  { name: 'Purple', value: '#9333ea' },
  { name: 'Pink', value: '#db2777' }
];

function loadSavedData() {
  try {
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      if (Array.isArray(data)) {
        return {
          tabs: data.map(t => ({ ...t, customName: false, color: t.color || null })),
          activeTabId: data[0]?.id || null
        };
      }
      return data;
    }
  } catch (e) { }
  return { tabs: [], activeTabId: null };
}

function saveData() {
  const data = {
    activeTabId: activeTabId,
    tabs: tabs.map((t) => ({
      id: t.id,
      name: t.name,
      muted: t.muted,
      customName: t.customName || false,
      color: t.color || null,
      url: t.url || null
    }))
  };
  fs.writeFileSync(dataPath, JSON.stringify(data));
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      // Ensure we preserve existing settings while adding defaults for new ones
      return {
        confirmOnClose: settings.confirmOnClose !== undefined ? settings.confirmOnClose : true,
        confirmOnTabClose: settings.confirmOnTabClose !== undefined ? settings.confirmOnTabClose : true
      };
    }
  } catch (e) { }
  return { confirmOnClose: true, confirmOnTabClose: true };
}

function saveSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings));
}

function updateAllTabBounds() {
  if (!mainWindow) return;
  const bounds = mainWindow.getContentBounds();
  const contentWidth = bounds.width - sidebarWidth;
  const contentHeight = bounds.height - TAB_BAR_HEIGHT;

  tabs.forEach(tab => {
    if (tab.id === activeTabId) {
      tab.view.setBounds({ x: sidebarWidth, y: TAB_BAR_HEIGHT, width: contentWidth, height: contentHeight });
    } else {
      tab.view.setBounds({ x: -3000, y: TAB_BAR_HEIGHT, width: contentWidth, height: contentHeight });
    }
  });
}

function recalculateTabNames() {
  let changed = false;
  tabs.forEach((tab, index) => {
    if (!tab.customName) {
      const newName = `Claude ${index + 1}`;
      if (tab.name !== newName) {
        tab.name = newName;
        mainWindow.webContents.send('tab-renamed', { id: tab.id, name: newName });
        changed = true;
      }
    }
  });
  if (changed) saveData();
}

function updateTotalUnread() {
  const total = tabs.reduce((acc, t) => {
    if (t.muted) return acc;
    return acc + (t.unread || 0);
  }, 0);

  mainWindow.webContents.send('draw-badge', total);
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    show: false,
    icon: path.join(__dirname, '../src/images/ic_outline-whatsapp.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  const menuTemplate = [
    {
      label: t('file'),
      submenu: [
        { label: t('quit'), role: 'quit' }, // Ctrl+Q
        { label: t('close'), role: 'close' } // Ctrl+W
      ]
    },
    { label: t('edit'), role: 'editMenu' },
    {
      label: t('view'),
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'Reset Zoom',
          accelerator: 'CommandOrControl+0',
          click: () => {
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab && tab.view) {
              tab.view.webContents.setZoomLevel(0);
            }
          }
        },
        {
          label: 'Zoom In',
          accelerator: 'CommandOrControl+=', // Fixes the Ctrl + issue
          click: () => {
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab && tab.view) {
              const level = tab.view.webContents.getZoomLevel();
              tab.view.webContents.setZoomLevel(level + 0.5);
            }
          }
        },
        {
          label: 'Zoom Out',
          accelerator: 'CommandOrControl+-',
          click: () => {
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab && tab.view) {
              const level = tab.view.webContents.getZoomLevel();
              tab.view.webContents.setZoomLevel(level - 0.5);
            }
          }
        },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { label: t('window'), role: 'windowMenu' }
  ];
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  mainWindow.on('close', (e) => {
    // If we are already in the process of quitting, or settings say don't ask
    const settings = loadSettings();
    
    if (isQuitting || !settings.confirmOnClose) {
      return; // Proceed with closing
    }

    // Prevent default close
    e.preventDefault();

    dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: [t('yes'), t('no')],
      defaultId: 0,
      cancelId: 1,
      title: t('confirmTitle'),
      message: t('confirmMessage'),
      checkboxLabel: t('dontAsk'),
      checkboxChecked: false,
    }).then(({ response, checkboxChecked }) => {
      if (response === 0) { // User clicked 'Yes'
        if (checkboxChecked) {
          // Update settings to not ask again
          saveSettings({ confirmOnClose: false });
        }

        // Set flag to true so the next close event passes through
        isQuitting = true;
        app.quit();
      }
      // If response === 1 (No), we do nothing, preventing the close.
    });
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');

    const savedData = loadSavedData();

    if (savedData.activeTabId) {
      activeTabId = savedData.activeTabId;
    }

    if (savedData.tabs.length > 0) {
      savedData.tabs.forEach(t => createTab(t.id, t.name, t.muted, t.customName, t.color, t.url));
    } else {
      createTab();
    }

    if (!tabs.find(t => t.id === activeTabId) && tabs.length > 0) {
      activeTabId = tabs[0].id;
    }

    recalculateTabNames();
    updateAllTabBounds();
    mainWindow.webContents.send('tab-switched', activeTabId);

    mainWindow.show();
  });

  nativeTheme.on('updated', () => {
    mainWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  });

  mainWindow.on('resize', updateAllTabBounds);
  mainWindow.on('maximize', updateAllTabBounds);
  mainWindow.on('unmaximize', updateAllTabBounds);
};

function createTab(existingId = null, existingName = null, existingMuted = false, existingCustomName = false, existingColor = null, existingUrl = null) {
  const tabId = existingId || Date.now();
  const tabName = existingName || 'Claude';
  const partition = `persist:claude-${tabId}`; // isolated cookies/storage per tab

  const view = new BrowserView({
    webPreferences: {
      partition,
      backgroundThrottling: false,
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'view-preload.cjs'),
    },
  });

  // Session-level UA also covers auth popups, since they share this partition
  view.webContents.session.setUserAgent(CHROME_UA);
  view.webContents.setUserAgent(CHROME_UA);
  view.webContents.setBackgroundThrottling(false);

  // Google / Apple sign-in opens as a real popup on the SAME partition,
  // so the login lands in this tab's account and window.opener keeps working
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || hostIn(url, AUTH_HOSTS)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          parent: mainWindow,
          width: 520,
          height: 720,
          autoHideMenuBar: true,
          webPreferences: { partition, contextIsolation: true, nodeIntegration: false },
        },
      };
    }
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  view.webContents.on('will-navigate', (event, url) => {
    if (!hostIn(url, APP_HOSTS) && !hostIn(url, AUTH_HOSTS)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  // Remember last page per tab (claude.ai is an SPA, so track in-page nav too)
  const trackUrl = (url) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab && hostIn(url, APP_HOSTS)) {
      tab.url = url;
      saveData();
    }
  };
  view.webContents.on('did-navigate', (_e, url) => trackUrl(url));
  view.webContents.on('did-navigate-in-page', (e, url, isMainFrame) => {
    if (isMainFrame ?? e.isMainFrame ?? true) trackUrl(url);
  });

  if (existingMuted) {
    view.webContents.setAudioMuted(true);
  }

  view.webContents.on('did-finish-load', () => {
    const currentTab = tabs.find(t => t.id === tabId);
    if (currentTab) {
      view.webContents.send('set-muted', currentTab.muted);
    }
  });

  const tabData = {
    id: tabId,
    view,
    name: tabName,
    unread: 0,
    muted: existingMuted,
    customName: existingCustomName,
    color: existingColor,
    url: existingUrl
  };

  tabs.push(tabData);
  mainWindow.addBrowserView(view);

  const checkPermission = (permission) => {
    const currentTab = tabs.find(t => t.id === tabId);
    if (permission === 'notifications' && currentTab && currentTab.muted) {
      return false;
    }
    const allowedPermissions = ['notifications', 'media', 'mediaKeySystem', 'geolocation', 'clipboard-read', 'clipboard-sanitized-write'];
    return allowedPermissions.includes(permission);
  };

  view.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(checkPermission(permission));
  });

  view.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    return checkPermission(permission);
  });

  const bounds = mainWindow.getContentBounds();
  const contentWidth = bounds.width - sidebarWidth;
  const contentHeight = bounds.height - TAB_BAR_HEIGHT;

  if (tabId === activeTabId) {
    view.setBounds({ x: sidebarWidth, y: TAB_BAR_HEIGHT, width: contentWidth, height: contentHeight });
  } else {
    view.setBounds({ x: -3000, y: TAB_BAR_HEIGHT, width: contentWidth, height: contentHeight });
  }

  view.setAutoResize({ width: false, height: false });
  view.webContents.loadURL(existingUrl && hostIn(existingUrl, APP_HOSTS) ? existingUrl : START_URL);

  mainWindow.webContents.send('tab-created', { id: tabId, name: tabName, muted: existingMuted, color: existingColor });

  if (!activeTabId) {
    activeTabId = tabId;
  }

  recalculateTabNames();
  saveData();

  // Switch to the new tab if it was created manually (not restored)
  if (!existingId) {
    switchTab(tabId);
  }
}

function switchTab(tabId) {
  activeTabId = tabId;
  updateAllTabBounds();
  mainWindow.webContents.send('tab-switched', tabId);
  saveData();
}

function switchToNextTab() {
  if (tabs.length < 2) return;
  const currentIndex = tabs.findIndex(t => t.id === activeTabId);
  const nextIndex = (currentIndex + 1) % tabs.length;
  switchTab(tabs[nextIndex].id);
}

function switchToPrevTab() {
  if (tabs.length < 2) return;
  const currentIndex = tabs.findIndex(t => t.id === activeTabId);
  const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  switchTab(tabs[prevIndex].id);
}

function closeTab(tabId) {
  const settings = loadSettings();

  const doClose = () => {
    const index = tabs.findIndex(t => t.id === tabId);
    if (index !== -1) {
      mainWindow.removeBrowserView(tabs[index].view);
      tabs[index].view.webContents.destroy();
      tabs.splice(index, 1);

      if (tabs.length > 0 && activeTabId === tabId) {
        switchTab(tabs[Math.max(0, index - 1)].id);
      }

      recalculateTabNames();
      saveData();
      updateTotalUnread();
    }
    mainWindow.webContents.send('tab-closed', tabId);
  };

  // If the user has checked "Do not ask again", close immediately
  if (!settings.confirmOnTabClose) {
    doClose();
    return;
  }

  // Show the confirmation dialog
  dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: [t('yes'), t('no')],
    defaultId: 1, // Default to "No" to prevent accidents
    cancelId: 1,
    title: t('confirmTabCloseTitle'),
    message: t('confirmTabCloseMessage'),
    detail: t('confirmTabCloseDetail'),
    checkboxLabel: t('dontAsk'),
    checkboxChecked: false,
  }).then(({ response, checkboxChecked }) => {
    if (response === 0) { // User clicked 'Yes'
      if (checkboxChecked) {
        // Save the preference to not ask again
        saveSettings({ ...settings, confirmOnTabClose: false });
      }
      doClose();
    }
  });
}

function clearTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    tab.url = null;
    tab.view.webContents.session.clearStorageData();
    tab.view.webContents.loadURL(START_URL);
    saveData();
  }
}

function refreshTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    tab.view.webContents.reload();
  }
}

function renameTab(tabId, newName) {
  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    tab.name = newName;
    tab.customName = true;
    saveData();
    mainWindow.webContents.send('tab-renamed', { id: tabId, name: newName });
  }
}

function reorderTabs(fromIndex, toIndex) {
  const [moved] = tabs.splice(fromIndex, 1);
  tabs.splice(toIndex, 0, moved);
  recalculateTabNames();
  saveData();
  mainWindow.webContents.send('tabs-reordered', tabs.map(t => t.id));
}

function changeTabColor(tabId, color) {
  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    tab.color = color;
    saveData();
    mainWindow.webContents.send('tab-color-changed', { id: tabId, color });
  }
}

ipcMain.on('update-badge', (_, dataUrl) => {
  if (!mainWindow) return;

  if (!dataUrl) {
    mainWindow.setOverlayIcon(null, '');
    return;
  }

  const image = nativeImage.createFromDataURL(dataUrl);
  mainWindow.setOverlayIcon(image, 'Unread messages');
});

ipcMain.on('create-tab', () => createTab());
ipcMain.on('switch-tab', (_, tabId) => switchTab(tabId));
ipcMain.on('close-tab', (_, tabId) => closeTab(tabId));
ipcMain.on('clear-tab', (_, tabId) => clearTab(tabId));
ipcMain.on('refresh-tab', (_, tabId) => refreshTab(tabId));
ipcMain.on('rename-tab', (_, { tabId, name }) => renameTab(tabId, name));
ipcMain.on('reorder-tabs', (_, { fromIndex, toIndex }) => reorderTabs(fromIndex, toIndex));
ipcMain.on('sidebar-toggled', (_, visible) => {
  sidebarWidth = visible ? 200 : 0;
  updateAllTabBounds();
});
ipcMain.on('next-tab', () => switchToNextTab());
ipcMain.on('prev-tab', () => switchToPrevTab());
ipcMain.on('minimize', () => mainWindow.minimize());
ipcMain.on('maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('close', () => mainWindow.close());

ipcMain.on('show-context-menu', (event, tabId) => {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  const colorSubmenu = TAB_COLORS.map(colorOption => ({
    label: colorOption.name,
    type: 'radio',
    checked: tab.color === colorOption.value,
    click: () => changeTabColor(tabId, colorOption.value)
  }));

  const template = [
    { label: t('rename'), click: () => mainWindow.webContents.send('start-rename', tabId) },
    { label: t('refresh'), click: () => refreshTab(tabId) },
    {
      label: tab.muted ? t('unmute') : t('mute'),
      click: () => {
        tab.muted = !tab.muted;
        tab.view.webContents.setAudioMuted(tab.muted);
        tab.view.webContents.send('set-muted', tab.muted);
        saveData();
        mainWindow.webContents.send('tab-muted', { id: tabId, muted: tab.muted });
        updateTotalUnread();
      }
    },
    { 
      label: 'Change Color', 
      submenu: colorSubmenu 
    },
    { label: t('clearSession'), click: () => clearTab(tabId) },
    { type: 'separator' },
    { label: t('closeTab'), click: () => closeTab(tabId) }
  ];

  Menu.buildFromTemplate(template).popup({ window: BrowserWindow.fromWebContents(event.sender) });
});

ipcMain.on('toggle-mute-tab', (_, tabId) => {
  const tab = tabs.find(t => t.id === tabId);
  if (tab) {
    tab.muted = !tab.muted;
    tab.view.webContents.setAudioMuted(tab.muted);
    tab.view.webContents.send('set-muted', tab.muted);
    saveData();
    mainWindow.webContents.send('tab-muted', { id: tabId, muted: tab.muted });
    updateTotalUnread();
  }
});

ipcMain.on('unread-count-changed', (event, count) => {
  const tab = tabs.find(t => t.view.webContents.id === event.sender.id);
  if (tab) {
    tab.unread = count;
    mainWindow.webContents.send('tab-unread', { id: tab.id, unread: count });
    updateTotalUnread();
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
