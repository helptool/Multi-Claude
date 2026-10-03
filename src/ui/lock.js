import { registerSettingsSection } from './settings.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function pinInput(placeholder) {
  const input = el('input');
  input.type = 'password';
  input.inputMode = 'numeric';
  input.maxLength = 16;
  input.autocomplete = 'off';
  input.placeholder = placeholder;
  return input;
}

export function initLock() {
  // ---------- lock screen ----------
  const screen = el('div', 'lock-screen');
  screen.hidden = true;
  const box = el('div', 'lock-box');
  const input = pinInput('PIN');
  const message = el('div', 'lock-message');
  const unlockBtn = el('button', 'btn primary', 'Unlock');
  unlockBtn.type = 'button';
  box.append(el('h2', '', 'Multi Claude is locked'), input, message, unlockBtn);
  screen.append(box);
  document.body.append(screen);

  let busy = false;
  let cooldownTimer = null;

  function setEnabled(enabled) {
    input.disabled = !enabled;
    unlockBtn.disabled = !enabled;
  }

  function startCooldown(ms) {
    clearInterval(cooldownTimer);
    const until = Date.now() + ms;
    setEnabled(false);
    const tick = () => {
      const left = Math.ceil((until - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(cooldownTimer);
        message.textContent = '';
        setEnabled(true);
        input.focus();
      } else {
        message.textContent = `Too many attempts. Try again in ${left} s.`;
      }
    };
    tick();
    cooldownTimer = setInterval(tick, 500);
  }

  async function submit() {
    if (busy || !input.value) return;
    busy = true;
    unlockBtn.disabled = true;
    try {
      const res = await window.electronAPI.verifyPin(input.value);
      input.value = '';
      if (res.ok) {
        delete document.body.dataset.locked;
        screen.hidden = true;
        message.textContent = '';
      } else if (res.retryAfterMs > 0) {
        startCooldown(res.retryAfterMs);
      } else {
        message.textContent = 'Incorrect PIN.';
      }
    } catch (err) {
      console.error(err);
      message.textContent = 'Could not verify the PIN.';
    } finally {
      busy = false;
      unlockBtn.disabled = input.disabled; // stays disabled during a cool-down
      if (!screen.hidden && !input.disabled) input.focus();
    }
  }

  unlockBtn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });

  window.electronAPI.onLockRequired(() => {
    document.body.dataset.locked = '1';
    screen.hidden = false;
    setEnabled(true);
    input.value = '';
    message.textContent = '';
    input.focus();
  });

  // ---------- settings section ----------
  registerSettingsSection(({ settings }) => {
    let enabled = !!settings.appLockEnabled;
    const section = el('div', 'settings-section');

    function render() {
      section.replaceChildren();
      section.append(el('h3', '', 'App lock'));
      section.append(el('span', 'settings-hint',
        enabled
          ? 'A PIN is required whenever the app starts.'
          : 'Off. Set a PIN to require it when the app starts.'));
      section.append(el('span', 'settings-hint',
        'This keeps people out of the app window; it does not encrypt the saved sessions on disk.'));

      const fields = el('div', 'settings-pin-fields');
      const current = enabled ? pinInput('Current PIN') : null;
      const next = pinInput(enabled ? 'New PIN (4–16 digits)' : 'PIN (4–16 digits)');
      const confirm = pinInput('Repeat new PIN');
      if (current) fields.append(current);
      fields.append(next, confirm);

      const status = el('span', 'settings-hint');
      const setBtn = el('button', 'btn', enabled ? 'Change PIN' : 'Set PIN');
      setBtn.type = 'button';
      const removeBtn = el('button', 'btn', 'Remove PIN');
      removeBtn.type = 'button';

      const finish = (res, okText, newState) => {
        if (res.ok) {
          enabled = newState;
          render();
          section.append(el('span', 'settings-hint', okText));
        } else {
          status.textContent = res.error || 'Something went wrong.';
        }
      };

      setBtn.addEventListener('click', async () => {
        status.textContent = '';
        if (next.value !== confirm.value) { status.textContent = 'The two PINs do not match.'; return; }
        setBtn.disabled = true;
        try {
          finish(await window.electronAPI.setPin(current ? current.value : undefined, next.value), 'PIN saved.', true);
        } catch (err) {
          console.error(err);
          status.textContent = 'Could not save the PIN.';
        } finally {
          setBtn.disabled = false;
        }
      });

      removeBtn.addEventListener('click', async () => {
        status.textContent = '';
        removeBtn.disabled = true;
        try {
          finish(await window.electronAPI.removePin(current.value), 'PIN removed.', false);
        } catch (err) {
          console.error(err);
          status.textContent = 'Could not remove the PIN.';
        } finally {
          removeBtn.disabled = false;
        }
      });

      const buttons = el('div', 'settings-pin-buttons');
      buttons.append(setBtn);
      if (enabled) buttons.append(removeBtn);
      buttons.append(status);
      section.append(fields, buttons);
    }

    render();
    return section;
  });
}
