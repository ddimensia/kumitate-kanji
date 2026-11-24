// App shell: start-up and routing.

import { initStore } from './store.js';
import { initState, dueCardIds, onChange, getSettings, markWelcomed } from './state.js';
import { startSharing, publishSoon } from './share.js';
import { loadCurriculum } from './data.js';
import { renderToday } from './views/today.js';
import { runLessons, nextBatch } from './views/lessons.js';
import { runReviews } from './views/reviews.js';
import { runPractice } from './views/practice.js';
import { renderBrowse } from './views/browse.js';
import { renderItem } from './views/itempage.js';
import { initPeek } from './views/peek.js';
import { renderSettings } from './views/settings.js';
import { renderWelcome } from './views/welcome.js';
import { toast } from './ui.js';

const main = document.getElementById('view');
let keyHandler = null;
let pending = null; // study screen waiting for the #study route

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  keyHandler?.(e);
});
const setKeys = (fn) => { keyHandler = fn; };

function freshRoot() {
  const root = document.createElement('div');
  root.className = 'view-root';
  main.replaceChildren(root);
  return root;
}

function navigate(hash) {
  if (location.hash === `#${hash}`) route();
  else location.hash = hash;
}

const exit = () => navigate('today');

function startStudy(fn) {
  pending = fn;
  navigate('study');
}

function startLessons(extra) {
  const batch = nextBatch(extra);
  if (!batch.length) { toast('No new items are unlocked right now.'); return; }
  startStudy((root) => runLessons(root, batch, {
    setKeys, onExit: exit,
    again: (what) => (what === 'reviews' ? startReviews() : startLessons(false)),
  }));
}

function startReviews() {
  const ids = dueCardIds();
  if (!ids.length) { toast('Nothing is due right now.'); exit(); return; }
  startStudy((root) => runReviews(root, ids, {
    setKeys, onExit: exit,
    again: () => startReviews(),
  }));
}

function startPractice(ids) {
  if (!ids.length) { toast('No recent mistakes to practise.'); return; }
  startStudy((root) => runPractice(root, ids, {
    setKeys, onExit: exit,
    again: () => startPractice(ids),
  }));
}

function updateNav() {
  const due = dueCardIds().length;
  const el = document.querySelector('.nav-due');
  if (el) {
    el.textContent = due ? String(due) : '';
    el.hidden = !due;
  }
}

let firstRoute = true;

function route() {
  setKeys(null);
  let [name, ...params] = (location.hash.slice(1) || 'today').split('/').map(decodeURIComponent);
  // A first visit opens on the welcome page. Going anywhere else (or leaving it) marks it seen.
  if (firstRoute && name === 'today' && !getSettings().welcomed) {
    history.replaceState(null, '', '#welcome');
    name = 'welcome';
  }
  firstRoute = false;
  if (name !== 'welcome') markWelcomed();
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('is-on', a.getAttribute('href') === `#${name}`));
  document.body.dataset.route = name;
  const root = freshRoot();
  if (name === 'study') {
    if (pending) { const fn = pending; pending = null; fn(root); }
    else exit();
    return;
  }
  if (name === 'browse') renderBrowse(root, params, navigate);
  else if (name === 'item') renderItem(root, params.join('/'), route);
  else if (name === 'settings') renderSettings(root, async () => { await initState(); publishSoon(0); route(); });
  else if (name === 'welcome') renderWelcome(root);
  else renderToday(root, { startLessons, startReviews, startPractice });
  window.scrollTo({ top: 0 });
}

let persistentStore = false;

async function start() {
  try {
    const { persistent } = await initStore();
    persistentStore = persistent;
    await Promise.all([initState(), loadCurriculum()]);
    if (!persistent) toast('Progress can’t be saved in this browser mode.', { error: true, ms: 6000 });
  } catch (err) {
    main.innerHTML = `<p class="panel warn">Kumitate Kanji couldn’t start: ${String(err.message || err)}</p>`;
    console.error(err);
    return;
  }
  onChange(updateNav);
  if (persistentStore) startSharing();
  updateNav();
  setInterval(() => {
    updateNav();
    if ((location.hash || '#today') === '#today' && !document.querySelector('dialog[open]')) route();
  }, 60000);
  window.addEventListener('hashchange', route);
  initPeek();
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker not registered', e));
  }
}

start();
