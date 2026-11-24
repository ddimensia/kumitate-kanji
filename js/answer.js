// Answer checking. Returns one of:
//   { verdict: 'correct' }                     right answer
//   { verdict: 'correct', note }               right, with a note (close spelling, rare reading)
//   { verdict: 'retry', note }                 not graded: a typo or the wrong kind of answer; try again
//   { verdict: 'wrong' }                       wrong
// 'retry' is what keeps a slip like ひるい for ひろい from counting as a miss.

import { toHiragana, toKana, isKana, isRomaji } from '../vendor/wanakana.js';
import { meanings, readingAnswers, parseKun, item } from './data.js';

// ---- Meanings -------------------------------------------------------------------

export function normalizeMeaning(s) {
  return (s || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[’`]/g, "'")
    .replace(/[-_/]/g, ' ')
    .replace(/[^a-z0-9' ]/g, '')
    .replace(/^(to|a|an|the) /, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Edit distance counting a swap of neighbours (wrok/work) as one edit. */
export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

/** Spelling mistakes allowed for a meaning of this length. */
export function meaningTolerance(len) {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 7) return 2;
  return 2 + Math.floor((len - 7) / 7);
}

export function checkMeaning(it, answer, synonyms = []) {
  const given = normalizeMeaning(answer);
  if (!given) return { verdict: 'retry', note: 'Type an answer first.' };
  const accepted = [...meanings(it), ...synonyms];
  const norm = accepted.map(normalizeMeaning).filter(Boolean);
  if (norm.includes(given)) return { verdict: 'correct' };
  // Typed kana or romaji that spells a reading: they answered the wrong question.
  const kana = toHiragana(toKana(answer.trim().toLowerCase()));
  if (isKana(kana) && readingsOf(it).includes(kana)) {
    return { verdict: 'retry', note: 'That’s the reading. We want the meaning.' };
  }
  let best = null;
  for (let i = 0; i < norm.length; i++) {
    const d = levenshtein(given, norm[i]);
    if (d <= meaningTolerance(norm[i].length) && (!best || d < best.d)) best = { d, text: accepted[i] };
  }
  if (best) return { verdict: 'correct', note: `Close enough: “${best.text}”.` };
  return { verdict: 'wrong' };
}

function readingsOf(it) {
  if (it.kind === 'k') return [...readingAnswers(it, 'on', { commonOnly: false }), ...readingAnswers(it, 'kun', { commonOnly: false })];
  if (it.kind === 'v') return it.readings.map((r) => toHiragana(r));
  return [];
}

// ---- Readings -------------------------------------------------------------------

/** Kana answer from what was typed (romaji left over is converted; a trailing n becomes ん). */
export function toKanaAnswer(s) {
  return toHiragana(toKana((s || '').trim().replace(/\s+/g, ''), { IMEMode: false }));
}

const SMALL = { 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'っ': 'つ', 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お' };
const DAKU = 'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ';
const PLAIN = 'かきくけこさしすせそたちつてとはひふへほはひふへほ';

function baseKana(c) {
  if (SMALL[c]) return SMALL[c];
  const i = DAKU.indexOf(c);
  return i >= 0 ? PLAIN[i] : c;
}

/**
 * Is `given` one slip away from `target` in a way that doesn't change which word it is
 * likely meant to be? Long vowels, small っ/ゃ/ゅ/ょ and dakuten are real distinctions in
 * Japanese (こうこう vs ここ, かいしゃ vs がいしゃ), so differences there count as wrong;
 * any other single-kana slip (ひるい for ひろい) is treated as a typo.
 */
export function isKanaTypo(given, target) {
  if (target.length < 3 || given === target) return false;
  if (levenshtein(given, target) !== 1) return false;
  if (given.length === target.length) {
    const i = [...given].findIndex((c, k) => c !== target[k]);
    const a = given[i], b = target[i];
    if (baseKana(a) === baseKana(b)) return false; // dakuten or small/large kana
    if ('うおいーえ'.includes(a) && 'うおいーえ'.includes(b) && i > 0) return false; // long vowel spelling
    return true;
  }
  // One kana added or dropped: wrong when it's a long vowel, small kana or ん.
  const [long, short] = given.length > target.length ? [given, target] : [target, given];
  let i = 0;
  while (i < short.length && long[i] === short[i]) i++;
  const extra = long[i];
  if ('うおいーえんっゃゅょ'.includes(extra)) return false;
  return true;
}

/**
 * 市 answered し: "し is 市’s on’yomi, used in words like 市民 (しみん). Try the reading 市 has on its own."
 */
function otherKanjiReadingNote(word, k, given) {
  const kind = readingAnswers(k, 'on', { commonOnly: false }).includes(given) ? 'on’yomi' : 'kun’yomi';
  // An example word that uses this reading of the kanji (easiest first).
  const example = k.vocab.map(item).find((v) => v && v.id !== word.id && v.w.length > 1 && v.furi
    && v.furi.some(([ruby, rt]) => ruby === k.ch && toHiragana(rt || '') === given));
  const where = example ? `, used in words like ${example.w} (${example.readings[0]})` : ', used in compound words';
  // No hint at the answer: just what the typed reading is, and a word that uses it.
  return `${given} is ${k.ch}’s ${kind}${where}. Try the reading ${word.w} has on its own.`;
}

export function checkReading(it, type, answer) {
  if (!answer || !answer.trim()) return { verdict: 'retry', note: 'Type an answer first.' };
  const given = toKanaAnswer(answer);
  if (!isKana(given)) {
    return { verdict: 'retry', note: isRomaji(answer) ? 'Type the reading in kana.' : 'Only kana, please.' };
  }

  if (it.kind === 'v') {
    const accepted = it.readings.map((r) => toHiragana(r));
    if (accepted.includes(given)) return { verdict: 'correct' };
    // A one-kanji word answered with another reading of its kanji (市: し, not いち). Checked
    // first: it's usually that kanji's reading in compounds, not really a different word.
    if (it.prereq.length === 1 && [...it.w].filter((c) => c >= '一').length === 1) {
      const k = item(it.prereq[0]);
      if (k && readingsOf(k).includes(given)) {
        const okurigana = [...it.w].some((c) => c < '一');
        if (okurigana) return { verdict: 'retry', note: 'That’s the kanji’s reading. Type the whole word, kana included.' };
        return { verdict: 'retry', note: otherKanjiReadingNote(it, k, given) };
      }
    }
    if (it.otherReadings.map((r) => toHiragana(r)).includes(given)) {
      return { verdict: 'retry', note: `That’s another word written ${it.w}. We want the one meaning “${it.senses[0][0]}”.` };
    }
    if (accepted.some((a) => isKanaTypo(given, a))) return { verdict: 'retry', note: 'Looks like a typo. Try again.', typo: true };
    return { verdict: 'wrong' };
  }

  // Kanji: on'yomi or kun'yomi card.
  const other = type === 'on' ? 'kun' : 'on';
  const common = readingAnswers(it, type);
  const all = readingAnswers(it, type, { commonOnly: false });
  if (common.includes(given)) return { verdict: 'correct' };
  if (all.includes(given)) return { verdict: 'correct', note: 'Correct, though that’s one of the less common readings.' };
  if (readingAnswers(it, other, { commonOnly: false }).includes(given)) {
    return {
      verdict: 'retry',
      note: type === 'on' ? 'That’s a kun’yomi. We want the on’yomi.' : 'That’s an on’yomi. We want the kun’yomi.',
    };
  }
  if (common.some((a) => isKanaTypo(given, a))) return { verdict: 'retry', note: 'Looks like a typo. Try again.', typo: true };
  return { verdict: 'wrong' };
}

/** 'あ.げる' -> 'あ(げる)', 'おお-' -> 'おお〜' */
export function kunDisplay(form) {
  const { stem, okuri, prefix, suffix } = parseKun(form);
  return `${suffix ? '〜' : ''}${stem}${okuri ? `(${okuri})` : ''}${prefix ? '〜' : ''}`;
}
