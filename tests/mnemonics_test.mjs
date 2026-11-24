// Checks data/mnemonics.json: every N5 kanji's taught readings have one, each uses its
// reading's sound-alike from the shared table, puts a meaning of the kanji in bold, stays
// short, and avoids a list of words.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { useCurriculum, curriculum, taughtReadings, kunFormsToShow } from '../js/data.js';

useCurriculum(JSON.parse(readFileSync(new URL('../data/curriculum.json', import.meta.url))));
const data = JSON.parse(readFileSync(new URL('../data/mnemonics.json', import.meta.url)));
const BANNED = new Set(['kill', 'die', 'dead', 'blood', 'gun', 'drug', 'drunk', 'sex', 'hate', 'stupid', 'damn', 'hell', 'shit', 'fat', 'ugly']);
const norm = (s) => s.toLowerCase().replace(/[^a-z' ]/g, '').trim();
const problems = [];
let n = 0;

for (const k of [...curriculum().items.values()].filter((it) => it.kind === 'k')) {
  const have = data.kanji[k.ch];
  if (!have && k.jlpt !== 5) continue; // the pilot covers N5
  const t = taughtReadings(k);
  const keys = [...t.on.map((r) => r.forms[0]), ...t.kun.map((r) => kunFormsToShow(r)[0])];
  for (const key of keys) {
    const text = have?.[key];
    if (!text) { problems.push(`${k.ch} ${key}: missing`); continue; }
    n++;
    const sound = [...text.matchAll(/\[\[(.+?)\]\]/g)].map((m) => m[1]).join(' ');
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
