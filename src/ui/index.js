import { initSwitcher } from './switcher.js';
import { initSettings } from './settings.js';
import { initFindBar } from './findbar.js';
import { initSplit } from './split.js';
import { initLock } from './lock.js';
import { initWorkspace } from './workspace.js';
// -- feature imports are added above this line --

export function initUi() {
  initSwitcher();
  initSettings();
  initFindBar();
  initSplit();
  initLock();
  initWorkspace();
  // -- feature init calls are added above this line --
}
