import { Tray, Menu } from 'electron';

/**
 * Creates the system tray icon + menu.
 * Returns { refresh, destroy }, or null if the tray could not be created.
 */
export function createTray({ icon, tooltip, getSettings, onShow, onToggleSetting, onOpenSettings, onQuit }) {
  let tray;
  try {
    tray = new Tray(icon);
  } catch (err) {
    console.error('[tray] could not create tray icon:', err);
    return null;
  }
  tray.setToolTip(tooltip);

  const buildMenu = () => {
    const s = getSettings();
    const items = [
      { label: 'Show Multi Claude', click: onShow },
    ];
    if (onOpenSettings) items.push({ label: 'Settings…', click: onOpenSettings });
    items.push(
      { type: 'separator' },
      {
        label: 'Minimize to tray on close',
        type: 'checkbox',
        checked: !!s.minimizeToTray,
        click: (item) => onToggleSetting('minimizeToTray', item.checked),
      },
      {
        label: 'Launch on Windows startup',
        type: 'checkbox',
        checked: !!s.launchOnStartup,
        click: (item) => onToggleSetting('launchOnStartup', item.checked),
      },
      { type: 'separator' },
      { label: 'Quit', click: onQuit },
    );
    return Menu.buildFromTemplate(items);
  };

  const refresh = () => {
    if (!tray.isDestroyed()) tray.setContextMenu(buildMenu());
  };
  refresh();

  tray.on('click', onShow);
  tray.on('double-click', onShow);

  return {
    refresh,
    destroy: () => { if (!tray.isDestroyed()) tray.destroy(); },
  };
}
