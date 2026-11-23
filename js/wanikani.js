// One-way import of your WaniKani progress (API v2, read-only token).
// Docs: https://docs.api.wanikani.com/20170710/
//
// Each radical, kanji and word you've started on WaniKani is matched to the same character
// or word here, and put into reviews with memory stability matching its WaniKani stage and
// its next review at the same time as on WaniKani. Nothing is ever sent to WaniKani.

import { curriculum } from './data.js';

const BASE = 'https://api.wanikani.com/v2/';

export class WkError extends Error {}

// WaniKani SRS stages: the review interval each stage waits for, as FSRS stability (days).
export const WK_STAGES = {
  1: { name: 'Apprentice I', days: 4 / 24 },
  2: { name: 'Apprentice II', days: 8 / 24 },
  3: { name: 'Apprentice III', days: 1 },
  4: { name: 'Apprentice IV', days: 2 },
  5: { name: 'Guru I', days: 7 },
  6: { name: 'Guru II', days: 14 },
  7: { name: 'Master', days: 30 },
  8: { name: 'Enlightened', days: 120 },
  9: { name: 'Burned', days: 365 },
};
export const STAGE_GROUPS = [
  ['Apprentice', [1, 2, 3, 4]],
  ['Guru', [5, 6]],
  ['Master', [7]],
  ['Enlightened', [8]],
  ['Burned', [9]],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, token) {
  for (let attempt = 0; attempt < 5; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'Wanikani-Revision': '20170710' } });
    } catch {
      throw new WkError('Couldn’t reach WaniKani. Check your internet connection and try again.');
    }
    if (res.status === 429) { await sleep(8000 * (attempt + 1)); continue; }
    if (res.status === 401) throw new WkError('WaniKani didn’t accept this API token. Copy it again from WaniKani’s API tokens page.');
    if (res.status === 403) throw new WkError('This API token doesn’t have permission to read your data.');
    if (!res.ok) throw new WkError(`WaniKani returned an error (${res.status}). Try again later.`);
    return res.json();
  }
  throw new WkError('WaniKani’s rate limit was reached. Wait a minute and try again.');
}

async function collect(path, token) {
  let url = BASE + path;
  const out = [];
  while (url) {
    const page = await request(url, token);
    out.push(...page.data);
    url = page.pages && page.pages.next_url;
  }
  return out;
}

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/**
 * Everything you've started on WaniKani:
 * { user, entries: [{ type: 'radical'|'kanji'|'vocabulary', chars, stage, availableAt }] }
 */
export async function fetchWaniKani(token, progress = () => {}) {
  if (!token) throw new WkError('Paste your WaniKani API token first.');
  progress('Checking your account…');
  const user = (await request(`${BASE}user`, token)).data;
  progress('Loading your progress…');
  const assignments = await collect('assignments?started=true&hidden=false&subject_types=radical,kanji,vocabulary', token);
  const byId = new Map(assignments.map((a) => [a.data.subject_id, a.data]));
  const ids = [...byId.keys()];
  const subjects = [];
  for (const [i, part] of chunk(ids, 500).entries()) {
    progress(`Loading items… ${Math.min((i + 1) * 500, ids.length)} of ${ids.length}`);
    subjects.push(...(await collect(`subjects?ids=${part.join(',')}`, token)));
  }
  const entries = [];
  for (const s of subjects) {
    const a = byId.get(s.id);
    if (!a || !s.data.characters || !a.srs_stage) continue;
    entries.push({ type: s.object, chars: s.data.characters, stage: a.srs_stage, availableAt: a.available_at });
  }
  return { user: { username: user.username, level: user.level }, entries };
}

/** Match WaniKani entries to items in this course. */
export function matchWaniKani(entries) {
  const db = curriculum();
  const vocabByWord = new Map();
  for (const it of db.items.values()) if (it.kind === 'v') vocabByWord.set(it.w, it);
  const matches = [];
  const unmatched = { radical: [], kanji: [], vocabulary: [] };
  for (const e of entries) {
    let it = null;
    if (e.type === 'radical') it = db.items.get('r:' + e.chars) || null;
    else if (e.type === 'kanji') it = db.items.get('k:' + e.chars) || null;
    else if (e.type === 'vocabulary') it = vocabByWord.get(e.chars.replace(/^[〜~]+|[〜~]+$/g, '')) || null;
    if (it) matches.push({ it, stage: e.stage, availableAt: e.availableAt });
    else unmatched[e.type]?.push(e.chars);
  }
  return { matches, unmatched };
}

/**
 * What an import will do: [{ it, stability, due }] for placeItems, from matched entries.
 * skipStudied leaves items you've already studied here alone. withParts also brings in
 * the not-yet-studied radicals and kanji the imported items are built from, at the
 * strongest stage of anything imported that uses them (you can't know 働 without 亻).
 */
export function planImport(matches, { skipStudied = true, withParts = true } = {}, { isIntroduced, unstudiedParts }) {
  const plan = new Map();
  for (const m of matches) {
    if (skipStudied && isIntroduced(m.it)) continue;
    const stability = WK_STAGES[m.stage]?.days ?? 0;
    const due = m.stage >= 9 ? null : m.availableAt;
    const prev = plan.get(m.it.id);
    if (!prev || stability > prev.stability) plan.set(m.it.id, { it: m.it, stability, due, stage: m.stage });
  }
  if (withParts) {
    const extra = new Map();
    for (const p of plan.values()) {
      for (const part of unstudiedParts(p.it)) {
        if (plan.has(part.id)) continue;
        const prev = extra.get(part.id);
        if (!prev || p.stability > prev.stability) extra.set(part.id, { it: part, stability: p.stability, stage: p.stage, part: true });
      }
    }
    for (const [id, e] of extra) plan.set(id, e);
  }
  // Parts first, so the course order stays sensible.
  return [...plan.values()].sort((a, b) => curriculum().position.get(a.it.id) - curriculum().position.get(b.it.id));
}
