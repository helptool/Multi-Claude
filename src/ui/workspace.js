import { registerSettingsSection } from './settings.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function initWorkspace() {
  registerSettingsSection(() => {
    const section = el('div', 'settings-section');
    section.append(el('h3', '', 'Workspace'));
    section.append(el('span', 'settings-hint',
      'Exports tab names, colours, order, pins, icons and zoom. Never cookies, tokens or URLs. Imported tabs start signed out.'));

    const message = el('span', 'settings-hint');
    const exportBtn = el('button', 'btn', 'Export…');
    const importBtn = el('button', 'btn', 'Import…');
    exportBtn.type = 'button';
    importBtn.type = 'button';

    const run = async (button, action, describe) => {
      message.textContent = '';
      button.disabled = true;
      try {
        const res = await action();
        if (res.ok) message.textContent = describe(res);
        else if (!res.canceled) message.textContent = res.error || 'Something went wrong.';
      } catch (err) {
        console.error(err);
        message.textContent = 'Something went wrong.';
      } finally {
        button.disabled = false;
      }
    };

    exportBtn.addEventListener('click', () => run(exportBtn, window.electronAPI.exportWorkspace,
      (r) => `Exported ${r.count} tab${r.count === 1 ? '' : 's'}.`));
    importBtn.addEventListener('click', () => run(importBtn, window.electronAPI.importWorkspace,
      (r) => `Imported ${r.imported} tab${r.imported === 1 ? '' : 's'}.`));

    const buttons = el('div', 'settings-pin-buttons');
    buttons.append(exportBtn, importBtn, message);
    section.append(buttons);
    return section;
  });
}
