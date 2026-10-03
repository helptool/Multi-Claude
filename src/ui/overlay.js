// Shared bookkeeping for in-window overlays. Main parks the native tab views off-screen
// while at least one overlay is open (native views would otherwise paint over the DOM).
let openCount = 0;

export function overlayOpened() {
  if (openCount++ === 0) window.electronAPI.overlayVisible(true);
}

export function overlayClosed() {
  if (openCount === 0) return;
  if (--openCount === 0) window.electronAPI.overlayVisible(false);
}
