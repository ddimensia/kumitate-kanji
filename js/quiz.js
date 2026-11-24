// The typed quiz used by both lesson quizzes and reviews.
//
// Each card is asked until it's answered right. In reviews, only the first answer in a
// session is graded for spaced repetition, and it's saved when you move on, so a wrong
// answer can be undone (Backspace) first, as on Bunpro. Typos and answers of the wrong
// kind ("that's the kun'yomi") aren't graded at all: the card shakes and you try again.

import { bind, unbind } from '../vendor/wanakana.js';
import { item, splitCardId, glyph, KIND_LABEL, TYPE_LABEL, typeLabel, meaningWord, meanings, taughtReadings, kunFormsToShow, readingToSay } from './data.js';
import { checkMeaning, checkReading, kunDisplay, toKanaAnswer } from './answer.js';
import { recordAnswer, getSynonyms, addSynonym, getSettings, logMiss, isIntroduced } from './state.js';
import { esc, readingBreakdownHtml, wordParts, wordReadingHint } from './ui.js';
import { speak, speakerButton, wireSpeech, readAloud } from './speech.js';
import { infoCardHtml, synonymEditorHtml, wireSynonymEditors } from './views/info.js';

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Shuffle, then nudge apart cards of the same item so they don't come back to back. */
export function arrange(ids) {
  const out = shuffle(ids.slice());
  for (let i = 1; i < out.length; i++) {
    if (splitCardId(out[i])[0] === splitCardId(out[i - 1])[0]) {
      const j = out.findIndex((x, k) => k > i && splitCardId(x)[0] !== splitCardId(out[i - 1])[0]);
      if (j > 0) [out[i], out[j]] = [out[j], out[i]];
    }
  }
  return out;
}

/**
 * Where a missed card goes back in the queue (0 = next), by how many times it's been missed
 * this session: a few cards later the first time, 1–2 later the second, then straight away,
 * since putting more cards in between doesn't help a card that isn't sticking.
 */
export function retryPosition(misses, random = Math.random) {
  if (misses <= 1) return 3 + Math.floor(random() * 4);
  if (misses === 2) return 1 + Math.floor(random() * 2);
  return 0;
}

/** Where a struggling card comes back once more to check it stuck, after it's finally right. */
export const checkPosition = (random = Math.random) => 3 + Math.floor(random() * 4);

/**
 * A hint for a reading question, or '' if there's none:
 *  - a kanji's on'yomi or kun'yomi: words you've learned that use it (as in 学校, 大学), so
 *    you can find the reading through a word you know;
 *  - a word's reading: which kind of reading each kanji uses (学 on'yomi + 校 on'yomi).
 */
export function hintFor(it, type) {
  if (type === 'r') return wordReadingHint(it);
  if (it.kind !== 'k' || (type !== 'on' && type !== 'kun')) return '';
  const kind = type === 'on' ? 'o' : 'k';
  // Not the kanji's own one-character word (山 for 山): that just repeats the question.
  const words = it.vocab.map(item).filter((v) => v && v.w !== it.ch && isIntroduced(v)
    && wordParts(v).some((p) => p.ruby === it.ch && p.kind === kind));
  return words.length ? `as in ${words.slice(0, 3).map((v) => v.w).join(', ')}` : '';
}

/** Why there's no hint for a question. */
function noHintReason(it, type) {
  if (type === 'm') return 'No hints for meanings.';
  if (type === 'on' || type === 'kun') return `No hint yet: you haven’t learned a word that uses this ${type === 'on' ? 'on’yomi' : 'kun’yomi'}.`;
  return 'No hint for this one.';
}

const PROMPT = {
  m: (it) => `${KIND_LABEL[it.kind]} <b>${meaningWord(it)}</b>`,
  on: () => `Kanji <b>on'yomi</b> reading`,
  kun: () => `Kanji <b>kun'yomi</b> reading`,
  r: () => `Vocabulary <b>reading</b>`,
};

function expectedHtml(it, type) {
  if (type === 'm') {
    const list = [...meanings(it), ...getSynonyms(it.id)];
    return list.slice(0, 8).map(esc).join(', ');
  }
  // Readings are big and clickable: tap one to hear it.
  const say = (kana, text) => `<button type="button" class="q-reading" lang="ja" data-say="${esc(kana)}" title="Play ${esc(kana)}">${esc(text)}</button>`;
  if (type === 'r') return it.readings.map((r) => say(r, r)).join('');
  return taughtReadings(it)[type]
    .map((r) => {
      if (type === 'on') return say(r.forms[0], r.forms[0]);
      return say(readingToSay('kun', r), kunFormsToShow(r).map(kunDisplay).join('・'));
    })
    .join('');
}

/**
 * Run a quiz in `root`. Options:
 *   mode: 'review' | 'lesson' | 'practice' (Extra study: not graded for spaced repetition)
 *   onDone({ total, right, wrong, missed: itemIds, missedCards: cardIds, unlocked: itemIds, ended })
 *   setKeys(handler)
 */
export function runQuiz(root, cardIds, { mode = 'review', onDone, setKeys, title = 'Reviews' }) {
  const queue = arrange(cardIds);
  const first = new Map(); // card id -> first answer right?
  const misses = new Map(); // card id -> times missed this session
  const hintedFirst = new Set(); // cards whose first answer came after a hint
  let hinted = false; // a hint was shown for the current question
  const toCheck = new Set(); // cards missed twice or more: once right, ask again a little later
  const unlocked = new Set();
  const total = new Set(cardIds).size;
  let current = null;
  let answered = null; // { ok, given, it, type }
  let rejected = null; // the last answer sent back to try again (typo, blank, wrong kind)

  root.innerHTML = `<section class="quiz mode-${mode}">
    <div class="quiz-top">
      <span class="quiz-title">${esc(title)}</span>
      <span class="quiz-progress" aria-live="polite"></span>
      <button type="button" class="btn small quiet quiz-end">${mode === 'lesson' ? 'Back to lesson' : 'End session'}</button>
    </div>
    <div class="quiz-bar"><span></span></div>
    <div class="quiz-stage"></div>
  </section>`;
  const stageEl = root.querySelector('.quiz-stage');
  const progressEl = root.querySelector('.quiz-progress');
  const barEl = root.querySelector('.quiz-bar span');
  wireSpeech(root);

  root.querySelector('.quiz-end').addEventListener('click', () => finish(true));

  function updateProgress() {
    const done = [...first.keys()].filter((id) => !queue.includes(id)).length;
    const right = [...first.values()].filter(Boolean).length;
    const pct = first.size ? Math.round((right / first.size) * 100) : 100;
    progressEl.textContent = `${done} / ${total}${first.size ? ` · ${pct}% right` : ''}`;
    barEl.style.width = `${(done / total) * 100}%`;
  }

  function next() {
    updateProgress();
    if (!queue.length) { finish(false); return; }
    current = queue[0];
    answered = null;
    renderQuestion();
  }

  function renderQuestion(prefill = '') {
    rejected = null;
    hinted = false;
    const [itemId, type] = splitCardId(current);
    const it = item(itemId);
    const reading = type !== 'm';
    stageEl.innerHTML = `
      <div class="q-card kind-${it.kind}" data-card="${esc(current)}">
        <div class="q-glyph ${it.kind === 'v' && it.w.length > 4 ? 'long' : ''}" lang="ja">${esc(glyph(it))}</div>
      </div>
      <div class="q-prompt ${reading ? 'is-reading' : 'is-meaning'}">${PROMPT[type](it)}</div>
      <form class="q-form" autocomplete="off">
        <input class="q-input" name="answer" ${reading ? `lang="ja" placeholder="${type === 'on' ? 'カタカナ' : 'ひらがな'}"` : 'placeholder="Your answer"'}
          autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="${esc(typeLabel(it, type))}">
        <button class="q-submit" aria-label="Submit">➜</button>
      </form>
      <p class="q-note" role="status"></p>
      <div class="q-after"></div>`;
    const input = stageEl.querySelector('.q-input');
    // On'yomi are written in katakana (as on info cards), everything else in hiragana.
    if (reading) bind(input, { IMEMode: type === 'on' ? 'toKatakana' : 'toHiragana' });
    input.value = prefill;
    stageEl.querySelector('.q-form').addEventListener('submit', (e) => {
      e.preventDefault();
      // The ➜ button (or a phone keyboard's Go key) answers, then moves on once answered.
      if (answered) advance();
      else submit(input, it, type);
    });
    setTimeout(() => input.focus(), 0);
  }

  function submit(input, it, type) {
    const given = input.value;
    let res = type === 'm' ? checkMeaning(it, given, getSynonyms(it.id)) : checkReading(it, type, given);
    const note = stageEl.querySelector('.q-note');
    // A blank answer the first time: a hint, if there is one (a right answer after it counts
    // as Hard), or a note that there isn't (which costs nothing). Enter again marks it wrong.
    if (!given.trim() && rejected === null && !hinted) {
      const hint = type === 'm' ? '' : hintFor(it, type);
      rejected = '';
      if (hint) hinted = true;
      note.className = `q-note ${hint ? 'is-hint' : 'is-retry'}`;
      note.textContent = hint ? `Hint: ${hint}. Press Enter again to mark it wrong.`
        : `${noHintReason(it, type)} Press Enter again to mark it wrong.`;
      input.focus();
      return;
    }
    // Enter again on the same rejected answer (or still blank) means "I don't know": wrong.
    if (res.verdict === 'retry' && rejected !== null && given.trim() === rejected) res = { verdict: 'wrong' };
    if (!given.trim() && hinted) res = { verdict: 'wrong' };
    if (res.verdict === 'retry') {
      rejected = given.trim();
      input.classList.remove('shake');
      void input.offsetWidth;
      input.classList.add('shake');
      note.textContent = `${res.note} Press Enter again to mark it wrong.`;
      note.className = 'q-note is-retry';
      input.select();
      return;
    }
    const ok = res.verdict === 'correct';
    answered = { ok, given, it, type, hinted };
    input.readOnly = true;
    try { unbind(input); } catch { /* not bound */ }
    stageEl.querySelector('.q-form').classList.add(ok ? 'is-right' : 'is-wrong');
    note.className = `q-note ${ok ? 'is-right' : 'is-wrong'}`;
    note.textContent = ok ? (res.note || (hinted ? 'Right, with a hint.' : '')) : '';
    renderAfter();
    // Read aloud (setting): a word's reading, or after a kanji reading question, the reading you
    // typed if right, otherwise that kind's common readings.
    if (type === 'r') readAloud(it);
    else if (type === 'on' || type === 'kun') {
      if (ok && getSettings().autoplay) speak(toKanaAnswer(given));
      else readAloud(it, type);
    }
  }

  function renderAfter(showInfo = false, showSyn = false) {
    const { ok, it, type, given } = answered;
    const after = stageEl.querySelector('.q-after');
    const say = it.kind === 'v' ? speakerButton(it.readings[0]) : '';
    after.innerHTML = `
      <div class="q-answer">
        <span class="q-answer-label">${ok ? 'Answer' : 'Correct answer'}</span>
        <span class="q-answer-text">${expectedHtml(it, type)}</span> ${say}
      </div>
      ${type === 'r' ? `<p class="q-gloss">“${esc(it.senses[0][0])}”</p>` : ''}
      ${type === 'r' ? readingBreakdownHtml(it) : ''}
      <div class="q-actions">
        ${ok ? '' : '<button type="button" class="btn small q-undo" title="Backspace">Undo <kbd>⌫</kbd></button>'}
        ${!ok && type === 'm' && given.trim() ? `<button type="button" class="btn small q-syn">Accept “${esc(given.trim())}” as mine</button>` : ''}
        <button type="button" class="btn small q-addsyn">${showSyn ? `Hide my ${meaningWord(it)}s` : `Add a ${meaningWord(it)}`}</button>
        <button type="button" class="btn small q-info" title="F">${showInfo ? 'Hide' : 'Show'} details <kbd>F</kbd></button>
        <button type="button" class="btn small primary q-next">Next <kbd>⏎</kbd></button>
      </div>
      ${showSyn ? synonymEditorHtml(it) : ''}
      ${showInfo ? infoCardHtml(it, { compact: true }) : ''}`;
    after.querySelector('.q-undo')?.addEventListener('click', undo);
    after.querySelector('.q-syn')?.addEventListener('click', acceptAsSynonym);
    after.querySelector('.q-info').addEventListener('click', () => renderAfter(!showInfo, showSyn));
    after.querySelector('.q-addsyn').addEventListener('click', () => {
      renderAfter(showInfo, !showSyn);
      after.querySelector('.syn-add input')?.focus();
    });
    wireSynonymEditors(after, (id, added) => {
      renderAfter(showInfo, true);
      if (added) {
        const note = stageEl.querySelector('.q-note');
        note.className = 'q-note is-right';
        note.textContent = `Added “${added}” to your ${meaningWord(it)}s.`;
      }
      after.querySelector('.syn-add input')?.focus();
    });
    after.querySelector('.q-next').addEventListener('click', advance);
    after.dataset.info = showInfo ? '1' : '';
  }

  function undo() {
    if (!answered || answered.ok) return;
    const given = answered.given;
    answered = null;
    renderQuestion(given);
  }

  async function acceptAsSynonym() {
    if (!answered) return;
    await addSynonym(answered.it.id, answered.given);
    answered.ok = true;
    stageEl.querySelector('.q-form').classList.replace('is-wrong', 'is-right');
    const note = stageEl.querySelector('.q-note');
    note.className = 'q-note is-right';
    note.textContent = `Added “${answered.given.trim()}” to your ${meaningWord(answered.it)}s.`;
    renderAfter();
  }

  async function advance() {
    if (!answered) return;
    const { ok, hinted: usedHint } = answered;
    const id = current;
    answered = null;
    if (!first.has(id)) {
      first.set(id, ok);
      if (ok && usedHint) hintedFirst.add(id);
      if (mode === 'review') {
        const newly = await recordAnswer(id, ok, undefined, { hinted: usedHint });
        newly.forEach((x) => unlocked.add(x));
      } else if (mode === 'lesson' && !ok) {
        await logMiss(id); // so lesson-quiz slips show up in Extra study
      }
      // 'practice' (Extra study) doesn't touch the schedule.
    }
    queue.shift();
    if (!ok) {
      // Ask again: later the first time, sooner each time after.
      const n = (misses.get(id) || 0) + 1;
      misses.set(id, n);
      if (n >= 2) toCheck.add(id);
      queue.splice(Math.min(queue.length, retryPosition(n)), 0, id);
    } else if (toCheck.delete(id)) {
      // Right after a run of misses, maybe only from just seeing the answer: check once more.
      queue.splice(Math.min(queue.length, checkPosition()), 0, id);
    }
    next();
  }

  function finish(ended) {
    setKeys(null);
    const right = [...first.values()].filter(Boolean).length;
    const missedCards = [...first].filter(([, v]) => !v).map(([id]) => id);
    const missed = [...new Set(missedCards.map((id) => splitCardId(id)[0]))];
    onDone({ total, answered: first.size, right, wrong: first.size - right, hinted: hintedFirst.size, missed, missedCards, unlocked: [...unlocked], ended, complete: !queue.length });
  }

  setKeys((e) => {
    if (!answered) return;
    if (e.target.closest?.('.syn-add')) return; // typing a new meaning: its own Enter adds it
    if (e.key === 'Backspace' && !answered.ok) { e.preventDefault(); undo(); }
    else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      renderAfter(!stageEl.querySelector('.q-after').dataset.info, !!stageEl.querySelector('.q-after .syn-editor'));
    } else if (e.key === 'Enter') {
      // Enter moves on from anywhere (a read-only answer box doesn't submit its form in
      // every browser), except on the Undo / Accept / Details buttons, which Enter presses.
      const b = document.activeElement?.closest?.('button');
      if (b && !b.classList.contains('q-next') && !b.classList.contains('q-reading') && stageEl.contains(b)) return;
      e.preventDefault();
      advance();
    }
  });

  next();
}
