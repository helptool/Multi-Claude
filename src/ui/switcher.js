import { overlayOpened, overlayClosed } from './overlay.js';

// Subsequence match with bonuses for consecutive characters and word starts. -1 = no match.
export function fuzzyScore(query, text) {
  const q = query.trim().toLowerCase();
  const s = text.toLowerCase();
  if (!q) return 0;
  let qi = 0;
  let score = 0;
  let prev = -2;
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] !== q[qi]) continue;
    score += 1;
    if (i === prev + 1) score += 3;                        // consecutive run
    if (i === 0 || /[\s\-_/.]/.test(s[i - 1])) score += 2; // word start
    prev = i;
    qi++;
  }
  return qi === q.length ? score - s.length * 0.01 : -1;
}

function collectTabs() {
  return [...document.querySelectorAll('#tabs .tab-container')].map((el, index) => ({
    id: Number(el.dataset.id),
    index,
    name: el.title || '',
    icon: el.querySelector('.tab-sign')?.textContent || '',
    color: el.dataset.color || '',
    pinned: !!el.closest('.tab-frame')?.classList.contains('pinned'),
    active: el.classList.contains('active'),
  })).filter(t => Number.isFinite(t.id));
}

export function initSwitcher() {
  const backdrop = document.createElement('div');
  backdrop.className = 'overlay-backdrop';
  backdrop.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'overlay-panel';

  const input = document.createElement('input');
  input.className = 'switcher-input';
  input.type = 'text';
  input.placeholder = 'Switch to tab…';
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Search tabs');

  const list = document.createElement('ul');
  list.className = 'switcher-list';
  list.setAttribute('role', 'listbox');

  panel.append(input, list);
  backdrop.append(panel);
  document.body.append(backdrop);

  let allTabs = [];
  let results = [];
  let selected = 0;
  let isOpen = false;

  function render() {
    list.replaceChildren();
    if (results.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'switcher-empty';
      empty.textContent = 'No matching tabs';
      list.append(empty);
      return;
    }
    results.forEach((tab, i) => {
      const li = document.createElement('li');
      li.className = 'switcher-item' + (i === selected ? ' selected' : '');
      li.setAttribute('role', 'option');

      const dot = document.createElement('span');
      dot.className = 'switcher-dot';
      if (tab.color) dot.style.background = tab.color; // colours come from main's fixed palette

      const sign = document.createElement('span');
      sign.className = 'switcher-sign';
      sign.textContent = tab.icon;

      const name = document.createElement('span');
      name.className = 'switcher-name';
      name.textContent = tab.name;

      const meta = document.createElement('span');
      meta.className = 'switcher-meta';
      meta.textContent = tab.active ? 'current' : tab.pinned ? 'pinned' : `Ctrl+${Math.min(tab.index + 1, 9)}`;

      li.append(dot, sign, name, meta);
      li.addEventListener('mousemove', () => {
        if (selected !== i) { selected = i; render(); }
      });
      li.addEventListener('click', () => choose(tab));
      list.append(li);
    });
    list.children[selected]?.scrollIntoView({ block: 'nearest' });
  }

  function filter() {
    const q = input.value;
    results = allTabs
      .map(tab => ({ tab, score: fuzzyScore(q, tab.name) }))
      .filter(r => r.score >= 0)
      .sort((a, b) => b.score - a.score || a.tab.index - b.tab.index)
      .map(r => r.tab);
    selected = Math.min(selected, Math.max(0, results.length - 1));
    render();
  }

  function open() {
    allTabs = collectTabs();
    input.value = '';
    selected = 0;
    isOpen = true;
    backdrop.hidden = false;
    overlayOpened();
    filter();
    input.focus();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    backdrop.hidden = true;
    overlayClosed();
  }

  function choose(tab) {
    if (!tab) return;
    window.electronAPI.switchTab(tab.id); // send first: main then focuses the *new* tab when the overlay closes
    close();
  }

  function move(delta) {
    if (results.length === 0) return;
    selected = (selected + delta + results.length) % results.length;
    render();
  }

  input.addEventListener('input', () => { selected = 0; filter(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[selected]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });

  // main sends this for Ctrl+K from anywhere (page or chrome); pressing it again closes
  window.electronAPI.onOpenSwitcher(() => (isOpen ? close() : open()));
}
