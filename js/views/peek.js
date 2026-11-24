// Looking at an item mid-session without leaving it.
//
// A lesson, review or extra study session lives only on the study screen, so following a link
// to an item page would end it. During a session, item links open in a window over the session
// instead. Each one is a browser history entry with the same URL, so the back button (or Esc,
// or the close button) steps back to the previous item and then to the session, unchanged.

import { renderItem } from './itempage.js';

let dlg = null;
let body = null;

function ensureDialog() {
  if (dlg) return;
  dlg = document.createElement('dialog');
  dlg.className = 'peek';
  dlg.setAttribute('aria-label', 'Item details');
  dlg.innerHTML = `<div class="peek-bar">
      <button type="button" class="btn quiet small" data-peek-close>← Back to your session</button>
      <span class="hint">Esc or your browser’s back button also returns.</span>
    </div>
    <div class="peek-body"></div>`;
  body = dlg.querySelector('.peek-body');
  dlg.querySelector('[data-peek-close]').addEventListener('click', () => history.back());
  // Esc: go back through history rather than just closing, so the entries stay in step.
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); history.back(); });
  document.body.append(dlg);
}

function show(id) {
  ensureDialog();
  const render = () => renderItem(body, id, render, { inSession: true });
  render();
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  body.scrollTop = 0;
}

function close() {
  if (dlg?.open) dlg.close();
}

/** Open item links over the session while studying. Call once at start-up. */
export function initPeek() {
  document.addEventListener('click', (e) => {
    if (document.body.dataset.route !== 'study') return;
    const a = e.target.closest?.('a[href^="#item/"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const id = decodeURIComponent(a.getAttribute('href').slice('#item/'.length));
    history.pushState({ peek: id }, '', location.href);
    show(id);
  }, true);
  window.addEventListener('popstate', (e) => {
    if (e.state?.peek && document.body.dataset.route === 'study') show(e.state.peek);
    else close();
  });
}
