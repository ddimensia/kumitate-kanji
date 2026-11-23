// Study progress: cards, unlocking, the daily lesson allowance, review queues and stats.

import * as store from './store.js';
import { configureSrs, newSrsCard, review, retrievability, Rating, State } from './srs.js';
import { curriculum, item, cardTypes, cardId, splitCardId } from './data.js';

export const DEFAULT_SETTINGS = {
  dailyMax: 15,         // most new items a day
  batchSize: 5,         // items per lesson batch
  adaptive: true,       // scale new items by recent accuracy and backlog
  retention: 0.9,       // FSRS target recall
  unlockStability: 3,   // days of memory stability before an item unlocks what builds on it
  autoplay: true,       // read kanji readings and words aloud (lesson cards, after reading answers)
  voice: '',            // speechSynthesis voice name ('' = best Japanese voice found)
  rate: 0.9,
  dayStartHour: 4,      // a study day starts at 4am
  firstReview: '4h',    // wait between a lesson and its first review
  missReview: '1h',     // wait before a missed card comes back
};

const srsOptions = (s) => ({ retention: s.retention, firstStep: s.firstReview, missStep: s.missReview });

let settings = { ...DEFAULT_SETTINGS };
const cards = new Map();
let synonyms = {};
let passed = {};
let recentLog = [];
const listeners = new Set();

export const DAY = 86400000;

export async function initState() {
  settings = { ...DEFAULT_SETTINGS, ...((await store.kvGet('settings')) || {}) };
  configureSrs(srsOptions(settings));
  cards.clear();
  for (const c of await store.getAll('cards')) cards.set(c.id, c);
  synonyms = (await store.kvGet('synonyms')) || {};
  passed = (await store.kvGet('passed')) || {};
  recentLog = await store.logSince(Date.now() - 30 * DAY);
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn());

// ---- Settings -----------------------------------------------------------------

export const getSettings = () => settings;

export async function saveSettings(patch) {
  settings = { ...settings, ...patch };
  if ('retention' in patch || 'firstReview' in patch || 'missReview' in patch) configureSrs(srsOptions(settings));
  await store.kvSet('settings', settings);
  emit();
}

// ---- Items ------------------------------------------------------------------------

export const getCard = (id) => cards.get(id);
export const itemCards = (it) => cardTypes(it).map((t) => cards.get(cardId(it.id, t))).filter(Boolean);
export const isIntroduced = (it) => cards.has(cardId(it.id, 'm'));
export const isPassed = (id) => !!passed[id];
export const isUnlocked = (it) => it.prereq.every((p) => passed[p] || !curriculum().items.has(p));
export const getSynonyms = (itemId) => synonyms[itemId] || [];

/** Lowest recall probability across an item's cards (0..1), or null if not studied. */
export function recall(it, now = new Date()) {
  const cs = itemCards(it);
  if (!cs.length) return null;
  return Math.min(...cs.map((c) => retrievability(c.srs, now)));
}

export const STAGES = ['locked', 'available', 'learning', 'fresh', 'settling', 'solid', 'mastered'];
export const STAGE_LABEL = {
  locked: 'Locked',
  available: 'Ready to learn',
  learning: 'Learning',
  fresh: 'Fresh (under a week)',
  settling: 'Settling (weeks)',
  solid: 'Solid (months)',
  mastered: 'Mastered (4+ months)',
};

/** Where an item stands, from its weakest card's memory stability. */
export function stage(it) {
  if (!isIntroduced(it)) return isUnlocked(it) ? 'available' : 'locked';
  const cs = itemCards(it);
  if (cs.some((c) => c.srs.state !== State.Review)) return 'learning';
  const s = Math.min(...cs.map((c) => c.srs.stability));
  if (s < 7) return 'fresh';
  if (s < 30) return 'settling';
  if (s < 120) return 'solid';
  return 'mastered';
}

function checkPassed(it, now) {
  if (passed[it.id]) return false;
  const cs = itemCards(it);
  if (cs.length < cardTypes(it).length) return false;
  if (cs.every((c) => c.srs.state === State.Review && c.srs.stability >= settings.unlockStability)) {
    passed[it.id] = now.getTime();
    return true;
  }
  return false;
}

// ---- Days, accuracy, allowance --------------------------------------------------

export function dayStart(now = new Date()) {
  const d = new Date(now);
  d.setHours(settings.dayStartHour, 0, 0, 0);
  if (d > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

export function learnedToday(now = new Date()) {
  const start = dayStart(now);
  let n = 0;
  for (const c of cards.values()) if (c.type === 'm' && !c.marked && c.introducedAt >= start) n++;
  return n;
}

/** Share of reviews (first answers, not lessons) answered right in the last `days` days. */
export function accuracy(days = 7, now = Date.now()) {
  const since = now - days * DAY;
  const rs = recentLog.filter((e) => e.kind === 'review' && e.ts >= since);
  if (!rs.length) return { rate: null, n: 0 };
  return { rate: rs.filter((e) => e.ok).length / rs.length, n: rs.length };
}

export function dueCardIds(now = new Date()) {
  const t = now.getTime();
  const out = [];
  for (const c of cards.values()) if (Date.parse(c.srs.due) <= t) out.push(c.id);
  return out;
}

/**
 * How many new items today. With adaptive pacing, the daily maximum is scaled down when
 * recent accuracy drops below 90% (to zero at 70%) or the review pile gets large.
 */
export function allowance(now = new Date()) {
  const max = settings.dailyMax;
  const used = learnedToday(now);
  let factor = 1;
  const reasons = [];
  if (settings.adaptive) {
    const acc = accuracy(7, now.getTime());
    if (acc.rate !== null && acc.n >= 20 && acc.rate < 0.9) {
      const f = Math.max(0, Math.min(1, (acc.rate - 0.7) / 0.2));
      factor *= f;
      reasons.push(`7-day accuracy is ${Math.round(acc.rate * 100)}%`);
    }
    const due = dueCardIds(now).length;
    if (due > 300) { factor = 0; reasons.push(`${due} reviews are waiting`); }
    else if (due > 150) { factor *= 0.5; reasons.push(`${due} reviews are waiting`); }
  }
  const limit = Math.round(max * factor);
  return { limit, used, remaining: Math.max(0, limit - used), max, reasons };
}

/** The next items to learn: curriculum order, skipping anything learned or still locked. */
export function lessonQueue(n = Infinity) {
  const db = curriculum();
  const out = [];
  for (const id of db.order) {
    const it = db.items.get(id);
    if (isIntroduced(it) || !isUnlocked(it)) continue;
    out.push(it);
    if (out.length >= n) break;
  }
  return out;
}

export function availableLessonCount() {
  return lessonQueue(1000).length;
}

// ---- Recording ----------------------------------------------------------------------

/** Start studying items after their lesson quiz: each card begins FSRS learning. */
export async function introduceItems(items, now = new Date()) {
  const fresh = [], logs = [];
  for (const it of items) {
    for (const t of cardTypes(it)) {
      const id = cardId(it.id, t);
      if (cards.has(id)) continue;
      const c = {
        id, item: it.id, type: t, introducedAt: now.getTime(),
        srs: review(newSrsCard(now), Rating.Good, now), right: 0, wrong: 0,
      };
      cards.set(id, c);
      fresh.push(c);
      logs.push({ ts: now.getTime(), card: id, ok: true, kind: 'lesson' });
    }
  }
  await store.putMany('cards', fresh);
  await store.addLogs(logs);
  recentLog.push(...logs);
  emit();
}

/**
 * Grade one review. Returns the ids of items that became unlocked because of it.
 */
export async function recordAnswer(id, ok, now = new Date()) {
  const c = cards.get(id);
  if (!c) return [];
  const before = new Set(lessonQueue(400).map((x) => x.id));
  c.srs = review(c.srs, ok ? Rating.Good : Rating.Again, now);
  if (ok) c.right++; else c.wrong++;
  c.lastAnswer = now.getTime();
  await store.putMany('cards', [c]);
  const entry = { ts: now.getTime(), card: id, ok, kind: 'review' };
  await store.addLogs([entry]);
  recentLog.push(entry);
  const it = item(splitCardId(id)[0]);
  let unlocked = [];
  if (checkPassed(it, now)) {
    await store.kvSet('passed', passed);
    unlocked = lessonQueue(400).map((x) => x.id).filter((x) => !before.has(x));
  }
  emit();
  return unlocked;
}

/** Note a miss that isn't a graded review (a lesson-quiz miss), for Extra study. */
export async function logMiss(id, kind = 'lessonquiz', now = new Date()) {
  const entry = { ts: now.getTime(), card: id, ok: false, kind };
  await store.addLogs([entry]);
  recentLog.push(entry);
}

/**
 * Items missed in your latest stretch of study: the 24 hours up to your most recent
 * lesson or review (further back than a day if you've taken a break). Most-missed first.
 */
export function recentMistakes(now = new Date()) {
  const studied = recentLog.filter((e) => e.kind === 'review' || e.kind === 'lesson' || e.kind === 'lessonquiz');
  if (!studied.length) return { since: null, items: [] };
  const last = Math.max(...studied.map((e) => e.ts));
  const since = last - DAY;
  const byItem = new Map();
  for (const e of studied) {
    if (e.ok || e.ts < since) continue;
    const [itemId] = splitCardId(e.card);
    const it = item(itemId);
    if (!it) continue;
    const m = byItem.get(itemId) || { it, misses: 0, cards: new Set(), last: 0 };
    m.misses++;
    m.cards.add(e.card);
    m.last = Math.max(m.last, e.ts);
    byItem.set(itemId, m);
  }
  const items = [...byItem.values()]
    .sort((a, b) => b.misses - a.misses || b.last - a.last)
    .map((m) => ({ ...m, cards: [...m.cards] }));
  return { since, until: last, items };
}

// ---- Setting your own level ------------------------------------------------------

/** Levels you can put an item at directly, with the memory stability (days) each implies. */
export const LEVELS = {
  learning: { label: 'Learning (review soon)', stability: 0 },
  fresh: { label: 'Fresh (under a week)', stability: 3 },
  settling: { label: 'Settling (weeks)', stability: 14 },
  solid: { label: 'Solid (months)', stability: 60 },
  mastered: { label: 'Mastered (4+ months)', stability: 180 },
};

/** Not-yet-studied parts an item is built from, all the way down (radicals and kanji). */
export function unstudiedParts(it, seen = new Set()) {
  const out = [];
  for (const p of it.prereq) {
    if (seen.has(p)) continue;
    seen.add(p);
    const part = item(p);
    if (!part) continue;
    out.push(...unstudiedParts(part, seen));
    if (!isIntroduced(part)) out.push(part);
  }
  return out;
}

/**
 * Put items straight into reviews at a chosen level, skipping their lessons. For known
 * levels, each card gets that much memory stability and a first review spread over the
 * interval, so marking a hundred items doesn't make them all due on one day. Items marked
 * this way don't count toward the day's new items. 'none' forgets the items instead.
 */
export async function setLevel(items, level, now = new Date()) {
  if (level === 'none') {
    for (const it of items) await resetItem(it, { quiet: true });
    emit();
    return;
  }
  await placeItems(items.map((it) => ({ it, stability: LEVELS[level].stability })), now);
}

/**
 * Put items straight into reviews. Each entry is { it, stability (days), due? }:
 * stability 0 starts the item as if its lesson was just done; otherwise each card is in
 * review with that stability, due at `due` or, without one, at a random point in the
 * interval so a large batch doesn't all come due on one day.
 */
export async function placeItems(list, now = new Date()) {
  const out = [];
  for (const { it, stability, due } of list) {
    for (const t of cardTypes(it)) {
      const id = cardId(it.id, t);
      const old = cards.get(id);
      let srs;
      if (!stability || stability < 1) {
        srs = review(newSrsCard(now), Rating.Good, now); // as after a lesson
        if (due && Date.parse(due) > now.getTime()) srs.due = new Date(due).toISOString();
      } else {
        const when = due
          ? new Date(Math.max(now.getTime(), Date.parse(due)))
          : new Date(now.getTime() + stability * (0.25 + Math.random() * 0.75) * DAY);
        srs = {
          ...newSrsCard(now),
          state: State.Review, stability, difficulty: 5, reps: 1, lapses: 0,
          scheduled_days: Math.round(stability), elapsed_days: 0, learning_steps: 0,
          due: when.toISOString(),
          // As if last reviewed one stability before it's due, so recall then is about 90%.
          last_review: new Date(Math.min(now.getTime(), when.getTime() - stability * DAY)).toISOString(),
        };
      }
      const c = {
        id, item: it.id, type: t, introducedAt: old?.introducedAt ?? now.getTime(),
        srs, right: old?.right || 0, wrong: old?.wrong || 0, marked: true,
      };
      cards.set(id, c);
      out.push(c);
    }
    if (stability >= settings.unlockStability) passed[it.id] = passed[it.id] || now.getTime();
    else delete passed[it.id];
  }
  await store.putMany('cards', out);
  await store.kvSet('passed', passed);
  emit();
  return out.length;
}

export async function addSynonym(itemId, text) {
  const t = text.trim();
  if (!t) return;
  const list = synonyms[itemId] || [];
  if (!list.includes(t)) list.push(t);
  synonyms[itemId] = list;
  await store.kvSet('synonyms', synonyms);
  emit();
}

export async function removeSynonym(itemId, text) {
  synonyms[itemId] = (synonyms[itemId] || []).filter((s) => s !== text);
  await store.kvSet('synonyms', synonyms);
  emit();
}

/** Forget an item: its cards go away and it returns to the lesson queue. */
export async function resetItem(it, { quiet = false } = {}) {
  const ids = cardTypes(it).map((t) => cardId(it.id, t));
  for (const id of ids) cards.delete(id);
  await store.deleteMany('cards', ids);
  delete passed[it.id];
  await store.kvSet('passed', passed);
  if (!quiet) emit();
}

// ---- Stats --------------------------------------------------------------------------

export function introducedItems() {
  const ids = new Set();
  for (const c of cards.values()) ids.add(c.item);
  return [...ids].map(item).filter(Boolean);
}

export function stageCounts() {
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0]));
  for (const it of introducedItems()) counts[stage(it)]++;
  return counts;
}

/** Studied items with the lowest current recall, excluding ones still in their first day. */
export function weakest(n = 8, kinds = 'rk', now = new Date()) {
  return introducedItems()
    .filter((it) => kinds.includes(it.kind))
    .map((it) => ({ it, r: recall(it, now) }))
    .sort((a, b) => a.r - b.r)
    .slice(0, n);
}

export function recentlyLearned(n = 8, kinds = 'rk', now = new Date()) {
  return introducedItems()
    .filter((it) => kinds.includes(it.kind) && !cards.get(cardId(it.id, 'm'))?.marked)
    .map((it) => ({ it, r: recall(it, now), at: cards.get(cardId(it.id, 'm')).introducedAt }))
    .sort((a, b) => b.at - a.at)
    .slice(0, n);
}

/** Reviews coming due: [{ label, count }] for now and the next hours, then days. */
export function forecast(now = new Date()) {
  const t = now.getTime();
  const buckets = [
    { label: 'Now', end: t },
    { label: 'Next hour', end: t + 3600000 },
    { label: 'Next 4 hours', end: t + 4 * 3600000 },
    { label: 'Rest of today', end: dayStart(now) + DAY },
    { label: 'Tomorrow', end: dayStart(now) + 2 * DAY },
    { label: 'This week', end: dayStart(now) + 7 * DAY },
  ];
  const counts = buckets.map(() => 0);
  for (const c of cards.values()) {
    const due = Date.parse(c.srs.due);
    const i = buckets.findIndex((b) => due <= b.end);
    if (i >= 0) counts[i]++;
  }
  return buckets.map((b, i) => ({ label: b.label, count: counts[i] })).filter((b, i) => i === 0 || b.count || i < 4);
}

export function itemHistory(it) {
  return itemCards(it).map((c) => ({ type: c.type, right: c.right, wrong: c.wrong, srs: c.srs }));
}
