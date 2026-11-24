// Checks data/mnemonics.json: every N5 kanji's taught readings have one, each uses its
// reading's sound-alike from the shared table (one that doesn't type as a near miss of the
// reading in romaji), puts a meaning of the kanji in bold, stays
// short, and avoids a list of words.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { useCurriculum, curriculum, taughtReadings, kunFormsToShow } from '../js/data.js';
import { toHiragana } from '../vendor/wanakana.js';

useCurriculum(JSON.parse(readFileSync(new URL('../data/curriculum.json', import.meta.url))));
const data = JSON.parse(readFileSync(new URL('../data/mnemonics.json', import.meta.url)));
const BANNED = new Set(['kill', 'die', 'dead', 'blood', 'gun', 'drug', 'drunk', 'sex', 'hate', 'stupid', 'damn', 'hell', 'shit', 'fat', 'ugly']);
const lev = (a, b) => {
  a = [...a]; b = [...b];
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
};
/**
 * A sound-alike that, typed as romaji, lands one kana off the reading teaches the wrong spelling
 * (sun -> すん for さん, he -> へ for ひ). Spelled-right parts (san-d, to-e) or plain English that
 * isn't romaji (dye, tie) are fine.
 */
function nearMiss(sound, key) {
  const kana = toHiragana(sound.toLowerCase().replace(/[^a-z]/g, ''));
  const want = toHiragana(key.replace(/[.\-]/g, ''));
  if (/[a-z]/.test(kana) || want.includes(kana)) return false;
  for (let i = 0; i < want.length; i++) for (let L = 1; L <= want.length - i; L++) if (lev(kana, want.slice(i, i + L)) <= 1) return true;
  return false;
}
const norm = (s) => s.toLowerCase().replace(/[^a-z' ]/g, '').trim();
const problems = [];
let n = 0;

for (const k of [...curriculum().items.values()].filter((it) => it.kind === 'k')) {
  const have = data.kanji[k.ch];
  if (!have && k.jlpt < 4) continue; // N5 and N4 so far
  const t = taughtReadings(k);
  const keys = [...t.on.map((r) => r.forms[0]), ...t.kun.map((r) => kunFormsToShow(r)[0])];
  for (const key of keys) {
    const text = have?.[key];
    if (!text) { problems.push(`${k.ch} ${key}: missing`); continue; }
    n++;
    const sound = [...text.matchAll(/\[\[(.+?)\]\]/g)].map((m) => m[1]).join(' ');
    if (nearMiss(sound, key)) problems.push(`${k.ch} ${key}: "${sound}" types as ${toHiragana(sound.toLowerCase().replace(/[^a-z]/g, ''))}, one kana off the reading`);
    if (norm(sound) !== norm(data.sounds[key] || '?')) problems.push(`${k.ch} ${key}: sound-alike "${sound}", table has "${data.sounds[key]}"`);
    const bold = [...text.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1].toLowerCase());
    const ms = k.meanings.map((m) => m.toLowerCase());
    if (!bold.some((b) => ms.some((m) => m.includes(b) || b.includes(m)))) problems.push(`${k.ch} ${key}: no meaning in bold`);
    const words = text.replace(/[　-鿿（）()、。]+/g, ' ').split(/\s+/).filter(Boolean).length;
    if (words > 25) problems.push(`${k.ch} ${key}: ${words} words`);
    const plain = text.replace(/\[\[|\]\]|\*\*/g, '').toLowerCase().match(/[a-z]+/g) || [];
    const bad = plain.filter((w) => BANNED.has(w));
    if (bad.length) problems.push(`${k.ch} ${key}: avoid ${bad.join(', ')}`);
  }
  for (const key of Object.keys(have || {})) if (!keys.includes(key)) problems.push(`${k.ch} ${key}: not a taught reading`);
}
assert.deepEqual(problems, [], problems.join('\n'));
console.log(`mnemonics_test: ${n} mnemonics checked`);
