// Draws the draggable divider in the 6px gap main leaves between the two split panes.
export function initSplit() {
  const divider = document.createElement('div');
  divider.id = 'split-divider';
  divider.hidden = true;
  document.body.append(divider);

  let layout = null;
  let markedId = null;
  let dragging = false;
  let queuedRatio = null;
  let frame = 0;

  function markSplitTab(id) {
    if (markedId === id) return;
    document.querySelector(`.tab-container[data-id="${markedId}"]`)?.classList.remove('split-pane');
    markedId = id;
    if (id !== null) document.querySelector(`.tab-container[data-id="${id}"]`)?.classList.add('split-pane');
  }

  window.electronAPI.onSplitLayout((next) => {
    layout = next;
    if (!next) {
      divider.hidden = true;
      dragging = false;
      divider.classList.remove('dragging');
      markSplitTab(null);
      return;
    }
    divider.hidden = false;
    divider.style.left = `${next.left}px`;
    divider.style.top = `${next.top}px`;
    divider.style.width = `${next.width}px`;
    markSplitTab(next.tabId);
  });

  function sendRatio(ratio) {
    queuedRatio = ratio;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      window.electronAPI.setSplitRatio(queuedRatio);
    });
  }

  divider.addEventListener('pointerdown', (e) => {
    if (!layout) return;
    dragging = true;
    divider.classList.add('dragging');
    divider.setPointerCapture(e.pointerId); // keep receiving moves while over the native views
    e.preventDefault();
  });

  divider.addEventListener('pointermove', (e) => {
    if (!dragging || !layout) return;
    sendRatio((e.clientX - layout.originX - layout.width / 2) / layout.usable);
  });

  const stop = (e) => {
    if (!dragging) return;
    dragging = false;
    divider.classList.remove('dragging');
    if (divider.hasPointerCapture?.(e.pointerId)) divider.releasePointerCapture(e.pointerId);
  };
  divider.addEventListener('pointerup', stop);
  divider.addEventListener('pointercancel', stop);
  divider.addEventListener('dblclick', () => window.electronAPI.setSplitRatio(0.5));
}
