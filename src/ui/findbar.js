export function initFindBar() {
  const host = document.getElementById('main-content');
  if (!host) return;

  const bar = document.createElement('div');
  bar.className = 'find-bar';
  bar.hidden = true;

  const input = document.createElement('input');
  input.className = 'find-input';
  input.type = 'text';
  input.placeholder = 'Find in page';
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Find in page');

  const count = document.createElement('span');
  count.className = 'find-count';

  const makeBtn = (label, title) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'find-btn';
    b.textContent = label;
    b.title = title;
    return b;
  };
  const prev = makeBtn('▲', 'Previous (Shift+Enter)');
  const next = makeBtn('▼', 'Next (Enter)');
  const closeBtn = makeBtn('✕', 'Close (Esc)');

  bar.append(input, count, prev, next, closeBtn);
  host.append(bar);

  let isOpen = false;
  let lastSearched = '';

  function search(forward) {
    const text = input.value;
    if (!text) {
      lastSearched = '';
      count.textContent = '';
    }
    const isNew = text !== lastSearched;
    lastSearched = text;
    window.electronAPI.findInPage({ text, forward, findNext: !isNew });
  }

  function open() {
    if (!isOpen) {
      isOpen = true;
      bar.hidden = false;
      lastSearched = '';
      window.electronAPI.findBarVisible(true);
    }
    input.focus();
    input.select();
    if (input.value) search(true);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    bar.hidden = true;
    count.textContent = '';
    lastSearched = '';
    window.electronAPI.findBarVisible(false);
  }

  input.addEventListener('input', () => search(true));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); search(!e.shiftKey); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  prev.addEventListener('click', () => { if (input.value) search(false); });
  next.addEventListener('click', () => { if (input.value) search(true); });
  closeBtn.addEventListener('click', close);

  window.electronAPI.onOpenFind(open);
  window.electronAPI.onCloseFind(close);
  window.electronAPI.onFindResult(({ active, total }) => {
    if (!isOpen) return;
    count.textContent = total > 0 ? `${active} / ${total}` : (input.value ? 'No results' : '');
  });
}
