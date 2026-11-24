// The curriculum: radicals, kanji and vocabulary from data/curriculum.json, indexed by id.
//
// Item ids: 'r:亻' (radical), 'k:日' (kanji), 'v:1234567' (vocab; the JMdict entry id).
// Each item has one card per question type:
//   radical: meaning        kanji: meaning, on, kun        vocab: meaning, reading
// Card ids are `${itemId}/${type}`.

import { toHiragana } from '../vendor/wanakana.js';

export const KIND_LABEL = { r: 'Radical', k: 'Kanji', v: 'Vocabulary' };
export const TYPE_LABEL = { m: 'Meaning', on: "On'yomi", kun: "Kun'yomi", r: 'Reading' };

let DB = null;

export function curriculum() {
  return DB;
}

export async function loadCurriculum(url = 'data/curriculum.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}: ${res.status}`);
  DB = index(await res.json());
  return DB;
}

/** Use already-parsed curriculum JSON (tests, tools). */
export function useCurriculum(raw) {
  DB = index(raw);
  return DB;
}

/** Builds the in-memory index. */
export function index(raw) {
  const items = new Map();
  for (const [ch, r] of Object.entries(raw.radicals)) {
    items.set('r:' + ch, {
      id: 'r:' + ch, kind: 'r', ch, name: r.n, alt: r.a || [], orig: r.o || null,
      strokes: r.s, users: (r.u || []).map((c) => 'k:' + c), prereq: [], jlpt: r.j || null, note: r.note || null,
    });
  }
  for (const [ch, k] of Object.entries(raw.kanji)) {
    items.set('k:' + ch, {
      id: 'k:' + ch, kind: 'k', ch, meanings: k.m,
      on: k.on.map(([forms, n, common, lv]) => ({ forms, n, common: !!common, lv: lv || 0 })),
      kun: k.kun.map(([forms, n, common, lv, show]) => ({ forms, n, common: !!common, lv: lv || 0, show: show || 2 })),
      jlpt: k.j, grade: k.g || null, freq: k.f || null, strokes: k.s,
      classical: k.kr && raw.classical?.[k.kr]
        ? { n: k.kr, ch: raw.classical[k.kr][0], name: raw.classical[k.kr][1], id: k.krid || null } : null,
      prereq: k.p, juku: (k.jk || []).map((i) => 'v:' + i), vocab: [], usedIn: [],
    });
  }
  for (const [id, v] of Object.entries(raw.vocab)) {
    const kanji = [...new Set([...v.w].filter((c) => items.has('k:' + c)).map((c) => 'k:' + c))];
    items.set('v:' + id, {
      id: 'v:' + id, kind: 'v', w: v.w, readings: v.r, senses: v.g, pos: v.p || [],
      furi: v.f || null, jlpt: v.j || null, common: !!v.c, prereq: kanji, otherReadings: v.ar || [],
    });
    for (const k of kanji) items.get(k).vocab.push('v:' + id);
  }
  // A radical has a meaning when it's also a kanji in the course with that meaning (糸 thread);
  // otherwise what you learn is its name (幺 short thread, 酉 sake jar).
  const norm = (s) => s.toLowerCase().replace(/[^a-z ]/g, '').trim();
  for (const it of items.values()) {
    if (it.kind !== 'r') continue;
    const k = items.get('k:' + it.ch);
    const n = norm(it.name);
    it.hasMeaning = !!k && k.meanings.some((m) => norm(m) === n || norm(m) === 'or ' + n); // 又: again / or again
  }
  const rank = (v) => [-(v.jlpt || 0), v.common ? 0 : 1, v.w.length];
  const cmp = (a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };
  for (const it of items.values()) {
    if (it.kind !== 'k') continue;
    it.vocab.sort((a, b) => cmp(items.get(a), items.get(b)));
    for (const p of it.prereq) {
      const part = items.get(p);
      if (part && part.kind === 'k') part.usedIn.push(it.id);
    }
  }
  const order = raw.order.filter((id) => items.has(id));
  const position = new Map(order.map((id, i) => [id, i]));
  return { items, order, position, sources: raw.sources, about: raw.about };
}

export function item(id) {
  return DB.items.get(id);
}

// Which of a kanji's common readings are taught (quizzed) with it. A reading is taught when a
// JLPT word using it is at most `readingWindow` levels harder than the kanji (2: an N5 kanji
// teaches readings used in N5-N3 words); others you meet later through those words.
// 'all' teaches every common reading.
let readingWindow = 2;
const taughtCache = new Map();

export function setReadingWindow(w) {
  if (w !== readingWindow) taughtCache.clear();
  readingWindow = w;
}

/** { on: [readings], kun: [readings] } taught with this kanji. */
const MAX_KUN = 2;

/** The forms of a kun'yomi worth showing, most used first: 生 い.きる (not い.かす, い.ける). */
export function kunFormsToShow(r) {
  const forms = r.forms.filter((f) => !f.startsWith('-'));
  return forms.length ? forms.slice(0, r.show || 2) : r.forms.slice(0, 1);
}

/** What to say for a reading: the kanji's own part, without okurigana (生きる -> い, 上 -> うわ). */
export function readingToSay(kind, r) {
  if (kind === 'on') return r.forms[0].replace(/-/g, '');
  return parseKun(kunFormsToShow(r)[0]).stem;
}

export function taughtReadings(it) {
  let t = taughtCache.get(it.id);
  if (t) return t;
  const ok = (r) => r.common && (readingWindow === 'all' || r.lv >= it.jlpt - readingWindow);
  // At most two kun'yomi, the most used (生 teaches い(きる) and う(まれる); なま comes with its word).
  const kun = it.kun.filter(ok);
  const topKun = new Set(kun.slice().sort((a, b) => b.n - a.n).slice(0, MAX_KUN));
  t = { on: it.on.filter(ok), kun: kun.filter((r) => topKun.has(r)) };
  if (!t.on.length && !t.kun.length) {
    // Every kanji teaches at least one reading: its most used common one.
    const best = [...it.on.map((r) => ['on', r]), ...it.kun.map((r) => ['kun', r])]
      .filter(([, r]) => r.common).sort((a, b) => b[1].n - a[1].n)[0];
    if (best) t[best[0]] = [best[1]];
  }
  taughtCache.set(it.id, t);
  return t;
}

export const isTaught = (it, kind, r) => taughtReadings(it)[kind].includes(r);

/** The question types an item is quizzed on. */
export function cardTypes(it) {
  if (it.kind === 'r') return ['m'];
  if (it.kind === 'v') return ['m', 'r'];
  const t = ['m'];
  const taught = taughtReadings(it);
  if (taught.on.length) t.push('on');
  if (taught.kun.length) t.push('kun');
  return t;
}

export const cardId = (itemId, type) => `${itemId}/${type}`;
export const splitCardId = (id) => {
  const i = id.lastIndexOf('/');
  return [id.slice(0, i), id.slice(i + 1)];
};

/** What is shown as the question: the character or word. */
export function glyph(it) {
  return it.kind === 'v' ? it.w : it.ch;
}

/** What a meaning question asks for: a radical's name unless it's also a kanji with that meaning. */
export function meaningWord(it) {
  return it.kind === 'r' && !it.hasMeaning ? 'name' : 'meaning';
}

/** The label for an item's question type: 'Name' for most radicals, otherwise TYPE_LABEL. */
export function typeLabel(it, type) {
  return type === 'm' && meaningWord(it) === 'name' ? 'Name' : TYPE_LABEL[type];
}

/** Main meaning shown in lists. */
export function primaryMeaning(it) {
  if (it.kind === 'r') return it.name;
  if (it.kind === 'k') return it.meanings[0] || '';
  return it.senses[0]?.[0] || '';
}

/** Every meaning accepted as an answer (before user synonyms). */
export function meanings(it) {
  if (it.kind === 'r') return [it.name, ...it.alt];
  if (it.kind === 'k') return it.meanings;
  return it.senses.flat();
}

// ---- Readings -----------------------------------------------------------------

/** 'あ.げる' -> { stem: 'あ', okuri: 'げる', prefix: false, suffix: false } */
export function parseKun(form) {
  const prefix = form.endsWith('-');
  const suffix = form.startsWith('-');
  const bare = form.replace(/-/g, '');
  const [stem, okuri = ''] = bare.split('.');
  return { stem, okuri, prefix, suffix };
}

/** Readings of a kanji of one kind, as hiragana strings a learner might type. */
export function readingAnswers(it, kind, { commonOnly = true, taughtOnly = false } = {}) {
  const out = new Set();
  for (const r of it[kind]) {
    if (commonOnly && !r.common) continue;
    if (taughtOnly && !isTaught(it, kind, r)) continue;
    for (const f of r.forms) {
      if (kind === 'on') {
        out.add(toHiragana(f.replace(/-/g, '')));
      } else {
        const { stem, okuri } = parseKun(f);
        out.add(stem);
        if (okuri) out.add(stem + okuri);
      }
    }
  }
  return [...out];
}

export function kanaOf(s) {
  return toHiragana(s || '');
}
