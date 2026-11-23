// A small, stable summary of your kanji progress for other apps on this site (Kakitori).
//
// It lives in its own database, 'kumitate-share', so other apps never open Kumitate Kanji's
// study database. Readers should open it without a version and abort the upgrade if it
// doesn't exist yet, so they never create it.
//
// Format 1, stored under the key 'progress' in the 'summary' store:
//   { format: 1, app: 'kumitate-kanji', updatedAt: ms,
//     kanji: [{ ch, order, jlpt, introducedAt, passedAt, stage }] }
// `kanji` lists every kanji you've started, in curriculum order. `order` is its position in
// the curriculum, `passedAt` is when it unlocked the items built on it (null until then), and
// `stage` is one of learning | fresh | settling | solid | mastered.

import { openWithStores } from './store.js';
import { introducedItems, introducedAt, passedAt, stage, onChange } from './state.js';
import { curriculum } from './data.js';

export const SHARE_DB = 'kumitate-share';
const STORE = 'summary';
const KEY = 'progress';

let dbPromise = null;
const openShare = () => {
  if (!dbPromise) {
    dbPromise = openWithStores(SHARE_DB, 1, [STORE], (db) => {
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    }, () => { dbPromise = null; }).catch((err) => { dbPromise = null; throw err; });
  }
  return dbPromise;
};

/** The summary as it stands now. */
export function buildSummary(now = Date.now()) {
  const { position } = curriculum();
  const kanji = introducedItems()
    .filter((it) => it.kind === 'k')
    .map((it) => ({
      ch: it.ch,
      order: position.get(it.id) ?? 1e9,
      jlpt: it.jlpt ?? null,
      introducedAt: introducedAt(it),
      passedAt: passedAt(it.id),
      stage: stage(it),
    }))
    .sort((a, b) => a.order - b.order);
  return { format: 1, app: 'kumitate-kanji', updatedAt: now, kanji };
}

export async function writeSummary(summary) {
  const db = await openShare();
  await new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(summary, KEY);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('aborted'));
  });
}

let timer = null;

/** Write the summary soon (changes come in bursts during a review session). */
export function publishSoon(delay = 1500) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    writeSummary(buildSummary()).catch((err) => console.warn('Could not share progress', err));
  }, delay);
}

/** Keep the summary current: write it now and after every change. */
export function startSharing() {
  onChange(() => publishSoon());
  publishSoon(0);
  // Write anything pending before the page goes away.
  addEventListener('pagehide', () => {
    if (timer) { clearTimeout(timer); timer = null; writeSummary(buildSummary()).catch(() => {}); }
  });
}
