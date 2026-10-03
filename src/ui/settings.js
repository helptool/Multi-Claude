import { overlayOpened, overlayClosed } from './overlay.js';

// Declarative description of the simple settings. Later features append entries at the marker.
export const SETTING_FIELDS = [
  { key: 'confirmOnClose', type: 'boolean', label: 'Confirm before quitting' },
  { key: 'confirmOnTabClose', type: 'boolean', label: 'Confirm before closing a tab' },
  { key: 'minimizeToTray', type: 'boolean', label: 'Minimize to tray when the window is closed' },
  { key: 'launchOnStartup', type: 'boolean', label: 'Launch on Windows startup', hint: 'Applies to installed (packaged) builds only.' },
  { key: 'globalHotkey', type: 'hotkey', label: 'Global show/hide hotkey', hint: 'Click the box and press a combination, e.g. Ctrl+Alt+C. Clear to disable.' },
  { key: 'defaultZoom', type: 'zoom', label: 'Default zoom', hint: 'Used by tabs you have not zoomed individually.' },
  { key: 'hibernateMinutes', type: 'number', label: 'Hibernate inactive tabs after', unit: 'min (0 = never)', min: 0, max: 1440,
    hint: 'Frees memory. The tab reloads its last page when selected; you stay signed in.' },
  { key: 'notifyOnResponse', type: 'boolean', label: 'Notify when a response finishes in a background tab (experimental)',
    hint: 'Muted tabs never notify. Relies on claude.ai internals and may need adjusting.' },
  // -- later features append fields above this line --
];

// Custom blocks (PIN, workspace export…): builder({ settings, close }) -> Node | null
const sectionBuilders = [];
export function registerSettingsSection(builder) {
  sectionBuilders.push(builder);
}

const KEY_NAMES = {
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Space: 'Space', Enter: 'Return',
  Tab: 'Tab', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';',
  Quote: "'", BracketLeft: '[', BracketRight: ']', Backquote: '`',
};

// KeyboardEvent -> Electron accelerator string (null if not a valid global shortcut)
function acceleratorFromEvent(e) {
  if (!(e.ctrlKey || e.altKey || e.metaKey)) return null; // a bare letter/shift would break typing everywhere
  const mods = [];
  if (e.ctrlKey) mods.push('Control');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Super');
  let key = null;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^F([1-9]|1\d|2[0-4])$/.test(e.code)) key = e.code;
  else if (KEY_NAMES[e.code]) key = KEY_NAMES[e.code];
  return key ? [...mods, key].join('+') : null;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function textBlock(label, hint) {
  const wrap = el('div', 'settings-text');
  wrap.append(el('span', '', label));
  if (hint) wrap.append(el('span', 'settings-hint', hint));
  return wrap;
}

// Chromium zoom: factor = 1.2 ^ level
const ZOOM_LEVELS = Array.from({ length: 17 }, (_, i) => -3 + i * 0.5);
const zoomLabel = (level) => `${Math.round(1.2 ** level * 100)}%`;

export function initSettings() {
  const backdrop = el('div', 'overlay-backdrop');
  backdrop.hidden = true;
  const panel = el('div', 'overlay-panel settings-panel');
  backdrop.append(panel);
  document.body.append(backdrop);

  let isOpen = false;
  let opening = false;

  function close() {
    if (!isOpen) return;
    isOpen = false;
    backdrop.hidden = true;
    panel.replaceChildren();
    overlayClosed();
  }

  function buildField(field, value, controls) {
    const row = el('div', 'settings-row');

    if (field.type === 'boolean') {
      const input = el('input');
      input.type = 'checkbox';
      input.checked = !!value;
      row.append(input, textBlock(field.label, field.hint));
      controls[field.key] = { get: () => input.checked, set: (v) => { input.checked = !!v; } };
    } else if (field.type === 'hotkey') {
      const input = el('input');
      input.type = 'text';
      input.readOnly = true;
      input.value = value || '';
      input.placeholder = 'Press a combination…';
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Tab') return; // let Esc close the dialog / Tab move focus
        e.preventDefault();
        if (['Backspace', 'Delete'].includes(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) { input.value = ''; return; }
        const accel = acceleratorFromEvent(e);
        if (accel) input.value = accel;
      });
      const clear = el('button', 'btn', 'Clear');
      clear.type = 'button';
      clear.addEventListener('click', () => { input.value = ''; });
      row.append(textBlock(field.label, field.hint), input, clear);
      controls[field.key] = { get: () => input.value.trim(), set: (v) => { input.value = v || ''; } };
    } else if (field.type === 'zoom') {
      const select = el('select');
      ZOOM_LEVELS.forEach(level => {
        const option = el('option', '', zoomLabel(level));
        option.value = String(level);
        select.append(option);
      });
      select.value = String(value ?? 0);
      row.append(textBlock(field.label, field.hint), select);
      controls[field.key] = { get: () => Number(select.value), set: (v) => { select.value = String(v ?? 0); } };
    } else if (field.type === 'number') {
      const input = el('input');
      input.type = 'number';
      input.min = String(field.min ?? 0);
      input.max = String(field.max ?? 9999);
      input.step = '1';
      input.value = String(value ?? 0);
      row.append(textBlock(field.label, field.hint), input);
      if (field.unit) row.append(el('span', 'settings-hint', field.unit));
      controls[field.key] = {
        get: () => {
          const n = Math.round(Number(input.value));
          return Number.isFinite(n) ? n : 0;
        },
        set: (v) => { input.value = String(v ?? 0); },
      };
    }
    return row;
  }

  function build(current) {
    panel.replaceChildren();
    const controls = {};

    const body = el('div', 'settings-body');
    SETTING_FIELDS.forEach(field => body.append(buildField(field, current[field.key], controls)));

    sectionBuilders.forEach(builder => {
      try {
        const node = builder({ settings: current, close });
        if (node) body.append(node);
      } catch (err) {
        console.error('settings section failed', err);
      }
    });

    const message = el('div', 'settings-message');
    const cancel = el('button', 'btn', 'Cancel');
    cancel.type = 'button';
    const save = el('button', 'btn primary', 'Save');
    save.type = 'button';
    const footer = el('div', 'settings-footer');
    footer.append(message, cancel, save);

    cancel.addEventListener('click', close);
    save.addEventListener('click', async () => {
      const patch = {};
      SETTING_FIELDS.forEach(f => { patch[f.key] = controls[f.key].get(); });
      save.disabled = true;
      message.className = 'settings-message';
      message.textContent = '';
      try {
        const res = await window.electronAPI.saveSettings(patch);
        if (res.errors && res.errors.length) {
          // main reverted what it could not apply; show the real values again
          SETTING_FIELDS.forEach(f => controls[f.key].set(res.settings[f.key]));
          message.className = 'settings-message error';
          message.textContent = res.errors.join(' ');
          save.disabled = false;
          return;
        }
        close();
      } catch (err) {
        console.error(err);
        message.className = 'settings-message error';
        message.textContent = 'Could not save settings.';
        save.disabled = false;
      }
    });

    panel.append(el('div', 'settings-header', 'Settings'), body, footer);
  }

  async function open() {
    if (isOpen || opening || document.body.dataset.locked) return;
    opening = true;
    try {
      const current = await window.electronAPI.getSettings();
      build(current);
      isOpen = true;
      backdrop.hidden = false;
      overlayOpened();
    } catch (err) {
      console.error('could not open settings', err);
    } finally {
      opening = false;
    }
  }

  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  backdrop.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // title-bar gear button (reuses the #window-buttons styling)
  const gear = el('div', '', '⚙');
  gear.id = 'btn-settings';
  gear.title = 'Settings (Ctrl+,)';
  gear.addEventListener('click', open);
  document.getElementById('window-buttons')?.prepend(gear);

  window.electronAPI.onOpenSettings(open);
}
