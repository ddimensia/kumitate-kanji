// Answer checking against the real curriculum: node tests/answer_test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { useCurriculum, item, cardTypes, taughtReadings, setReadingWindow, kunFormsToShow, readingToSay } from '../js/data.js';
import { checkMeaning, checkReading, isKanaTypo, toKanaAnswer } from '../js/answer.js';
import { readingBreakdownHtml } from '../js/ui.js';

useCurriculum(JSON.parse(readFileSync(new URL('../data/curriculum.json', import.meta.url))));
const v = (w) => [...item('k:' + [...w][0]).vocab].map(item).find((x) => x.w === w);
let n = 0;
const ok = (res, verdict, msg) => { n++; assert.equal(res.verdict, verdict, `${msg}: ${JSON.stringify(res)}`); };

// Meanings
ok(checkMeaning(item('k:日'), 'Sun'), 'correct', 'exact, case-insensitive');
ok(checkMeaning(item('k:日'), 'japan'), 'correct', 'any listed meaning');
ok(checkMeaning(item('k:働'), 'wrok'), 'correct', 'small typo is close enough');
ok(checkMeaning(item('k:働'), 'play'), 'wrong', 'wrong meaning');
ok(checkMeaning(item('r:亻'), 'person'), 'correct', 'radical name');
ok(checkMeaning(item('k:日'), 'nichi'), 'retry', 'typed the reading instead');
ok(checkMeaning(item('k:日'), 'star', ['star']), 'correct', 'user synonym');
const hiroi = v('広い');
ok(checkMeaning(hiroi, 'wide'), 'correct', 'vocab gloss');
ok(checkMeaning(v('食べる'), 'eat'), 'correct', '"to eat" accepted without "to"');

// Readings
ok(checkReading(hiroi, 'r', 'hiroi'), 'correct', 'romaji converted');
ok(checkReading(hiroi, 'r', 'ひろい'), 'correct', 'kana');
ok(checkReading(hiroi, 'r', 'hirui'), 'retry', 'typo hirui -> retry');
ok(checkReading(hiroi, 'r', 'ひろ'), 'retry', 'kanji reading only: nudge to type the whole word');
ok(checkReading(hiroi, 'r', 'せまい'), 'wrong', 'different word');
ok(checkReading(v('学校'), 'r', 'がっこ'), 'wrong', 'missing long vowel is a real mistake');
ok(checkReading(v('学校'), 'r', 'かっこう'), 'wrong', 'dakuten is a real mistake');
ok(checkReading(item('k:日'), 'on', 'にち'), 'correct', 'on reading');
ok(checkReading(item('k:日'), 'on', 'ニチ'), 'correct', 'katakana typed');
ok(checkReading(item('k:日'), 'on', 'ひ'), 'retry', 'kun given for on');
ok(checkReading(item('k:上'), 'kun', 'うえ'), 'correct', 'kun stem');
ok(checkReading(item('k:上'), 'kun', 'あがる'), 'correct', 'kun with okurigana');
ok(checkReading(item('k:上'), 'kun', 'じょう'), 'retry', 'on given for kun');
ok(checkReading(item('k:生'), 'on', 'しょう'), 'correct', 'second common on');
ok(checkReading(item('k:日'), 'on', 'tsuki'), 'wrong', 'wrong reading');
ok(checkReading(item('k:日'), 'on', ''), 'retry', 'empty');
ok(checkReading(item('k:日'), 'on', 'abc'), 'retry', 'leftover latin');

const hi = item('k:日').vocab.map(item).filter((x) => x.w === '日');
assert.equal(hi.length, 1, 'one word per spelling'); n++;
ok(checkReading(hi[0], 'r', hi[0].otherReadings[0]), 'retry', 'reading of another word spelled the same');
assert.equal(toKanaAnswer('hon'), 'ほん'); n++;
assert.equal(isKanaTypo('ひるい', 'ひろい'), true); n++;
assert.equal(isKanaTypo('こここ', 'こうこう'), false); n++;
// Taught readings: those used in JLPT words up to two levels past the kanji (default).
const forms = (it, kind) => taughtReadings(it)[kind].map((r) => r.forms[0]);
assert.deepEqual(forms(item('k:田'), 'on'), [], '田: デン (only N1 words) not taught'); n++;
assert.deepEqual(forms(item('k:田'), 'kun'), ['た'], '田: た taught'); n++;
assert.deepEqual(cardTypes(item('k:田')), ['m', 'kun'], '田 has no on\'yomi question'); n++;
assert.ok(forms(item('k:読'), 'on').includes('ドク'), '読: ドク (読書, N3) taught at window 2'); n++;
ok(checkReading(item('k:田'), 'kun', 'でん'), 'retry', 'デン typed for the kun card: wrong kind, try again');
setReadingWindow(1);
assert.ok(!forms(item('k:読'), 'on').includes('ドク'), '読: ドク not taught at window 1'); n++;
setReadingWindow('all');
assert.deepEqual(forms(item('k:田'), 'on'), ['デン'], 'all common readings: デン taught'); n++;
setReadingWindow(2);

// Kun'yomi pared down: at most two per kanji, the most used, each shown in its most used forms.
const sei = item('k:生');
assert.deepEqual(taughtReadings(sei).kun.map((r) => kunFormsToShow(r)), [['い.きる'], ['う.まれる']], '生: い(きる) and う(まれる) only'); n++;
assert.deepEqual(taughtReadings(sei).kun.map((r) => readingToSay('kun', r)), ['い', 'う'], '生: read aloud without okurigana'); n++;
assert.ok(taughtReadings(item('k:上')).kun.length <= 2, '上: no more than two kun\'yomi taught'); n++;
assert.deepEqual(kunFormsToShow(item('k:立').kun.find((r) => r.forms.includes('た.つ'))), ['た.つ', 'た.てる'], '立: た(つ)・た(てる), not た(ち)〜'); n++;
ok(checkReading(sei, 'kun', 'なま'), 'correct', '生: なま is still accepted though not taught');

// A one-kanji word answered with its kanji's other reading: explained, not "another word".
const ichi = checkReading(v('市'), 'r', 'し');
ok(ichi, 'retry', '市 answered し');
assert.match(ichi.note, /^し is 市’s on’yomi, used in words like \S+ \(\S+\)\. Try the reading 市 has on its own\.$/, 'explains the on\'yomi'); n++;
assert.ok(!ichi.note.includes('いち') && !ichi.note.includes('market'), 'without giving the answer away'); n++;
// After a word's reading: which reading each kanji uses, with sound changes traced back.
const parts = (w) => readingBreakdownHtml(v(w)).replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
assert.equal(parts('学校'), "学 がっ on'yomi (from がく)+校 こう on'yomi", '学校 breakdown'); n++;
assert.equal(parts('食べる'), "食 た kun'yomi+べる", '食べる breakdown'); n++;
assert.equal(parts('手紙'), "手 て kun'yomi+紙 がみ kun'yomi (from かみ)", '手紙: rendaku'); n++;
assert.equal(parts('切手'), "切 きっ kun'yomi (from き(る))+手 て kun'yomi", '切手: untagged in the data, still explained'); n++;
assert.equal(parts('大人'), '大人 おとな special reading for the whole word', '大人: jukujikun'); n++;
// Typos are slips of the fingers: one romaji letter, a swapped consonant on a neighbouring key.
ok(checkReading(sei, 'on', 'chou'), 'wrong', 'ちょう for しょう: c and s are far apart');
ok(checkReading(sei, 'on', 'shoku'), 'wrong', 'しょく for しょう: a different kana, not a slip');
ok(checkReading(sei, 'on', 'shuu'), 'wrong', 'しゅう for しょう: a different sound');
ok(checkReading(sei, 'on', 'shpu'), 'retry', 'しょう typed with p for o (neighbouring keys)');
ok(checkReading(sei, 'on', 'hsou'), 'retry', 'two letters swapped');
console.log(`answer_test: ${n} checks passed`);
