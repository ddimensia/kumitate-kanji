// Persistence: IndexedDB with an in-memory fallback.
// Stores: kv (settings, synonyms, passed items), cards (one per question), log (answers).

const DB_NAME = 'yomitori';
const DB_VERSION = 1;
const STORES = ['kv', 'cards', 'log'];
const KV_KEYS = ['settings', 'synonyms', 'passed', 'notes'];

let dbPromise = null;
let memory = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('log')) {
        const log = db.createObjectStore('log', { keyPath: 'id', autoIncrement: true });
        log.createIndex('ts', 'ts');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Yomitori is open in another tab with an older version.'));
  });
  return dbPromise;
}

export async function initStore() {
  try {
    await openDb();
    try { await navigator.storage?.persist?.(); } catch { /* optional */ }
    return { persistent: true };
  } catch (err) {
    console.warn('IndexedDB unavailable, using memory only', err);
    memory = { kv: new Map(), cards: new Map(), log: new Map(), logSeq: 0 };
    return { persistent: false };
  }
}

function tx(store, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        let result;
        Promise.resolve(fn(s)).then((r) => { result = r; });
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('transaction aborted'));
      }),
  );
}

const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function kvGet(key) {
  if (memory) return memory.kv.get(key);
  return tx('kv', 'readonly', (s) => reqP(s.get(key)));
}

export async function kvSet(key, value) {
  if (memory) { memory.kv.set(key, value); return; }
  return tx('kv', 'readwrite', (s) => { s.put(value, key); });
}

export async function getAll(store) {
  if (memory) return [...memory[store].values()];
  return tx(store, 'readonly', (s) => reqP(s.getAll()));
}

export async function putMany(store, items) {
  if (!items.length) return;
  if (memory) { for (const it of items) memory[store].set(it.id, it); return; }
  return tx(store, 'readwrite', (s) => { for (const it of items) s.put(it); });
}

export async function deleteMany(store, keys) {
  if (!keys.length) return;
  if (memory) { for (const k of keys) memory[store].delete(k); return; }
  return tx(store, 'readwrite', (s) => { for (const k of keys) s.delete(k); });
}

export async function addLogs(entries) {
  if (!entries.length) return;
  if (memory) { for (const e of entries) { const id = ++memory.logSeq; memory.log.set(id, { ...e, id }); } return; }
  return tx('log', 'readwrite', (s) => { for (const e of entries) s.add(e); });
}

export async function logSince(ts) {
  if (memory) return [...memory.log.values()].filter((e) => e.ts >= ts);
  return tx('log', 'readonly', (s) => reqP(s.index('ts').getAll(IDBKeyRange.lowerBound(ts))));
}

async function clearStore(store) {
  if (memory) { memory[store].clear(); return; }
  return tx(store, 'readwrite', (s) => { s.clear(); });
}

export async function exportAll() {
  const out = { app: 'yomitori', version: 1, exportedAt: new Date().toISOString(), kv: {} };
  for (const key of KV_KEYS) out.kv[key] = await kvGet(key);
  out.cards = await getAll('cards');
  out.log = await getAll('log');
  return out;
}

export async function importAll(data) {
  if (!data || data.app !== 'yomitori' || !Array.isArray(data.cards)) throw new Error('This file is not a Yomitori backup.');
  for (const store of STORES) await clearStore(store);
  await putMany('cards', data.cards);
  await addLogs((data.log || []).map((e) => { const { id, ...rest } = e; return rest; }));
  for (const key of KV_KEYS) if (data.kv?.[key] !== undefined) await kvSet(key, data.kv[key]);
}

export async function wipeAll() {
  for (const store of STORES) await clearStore(store);
}
