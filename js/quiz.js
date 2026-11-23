// The typed quiz used by both lesson quizzes and reviews.
//
// Each card is asked until it's answered right. In reviews, only the first answer in a
// session is graded for spaced repetition, and it's saved when you move on, so a wrong
// answer can be undone (Backspace) first, as on Bunpro. Typos and answers of the wrong
// kind ("that's the kun'yomi") aren't graded at all: the card shakes and you try again.

import { bind, unbind } from '../vendor/wanakana.js';
import { item, splitCardId, glyph, KIND_LABEL, TYPE_LABEL, meanings } from './data.js';
import { checkMeaning, checkReading, kunDisplay } from './answer.js';
import { recordAnswer, getSynonyms, addSynonym, getSettings } from './state.js';
import { esc } from './ui.js';
import { speak, speakerButton, wireSpeech } from './speech.js';
import { infoCardHtml } from './views/info.js';

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

const PROMPT = {
  m: (it) => `${KIND_LABEL[it.kind]} <b>meaning</b>`,
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
  return it[type]
    .filter((r) => r.common)
    .map((r) => {
      if (type === 'on') return say(r.forms[0], r.forms[0]);
      const forms = r.forms.filter((f) => !f.startsWith('-'));
      const f = forms[0] || r.forms[0];
      return say(f.replace(/[.-]/g, ''), (forms.length ? forms : [f]).map(kunDisplay).join('・'));
    })
    .join('');
}

/**
 * Run a quiz in `root`. Options:
 *   mode: 'review' | 'lesson'
 *   onDone({ total, right, wrong, missed: itemIds, unlocked: itemIds, ended })
 *   setKeys(handler)
 */
export function runQuiz(root, cardIds, { mode = 'review', onDone, setKeys, title = 'Reviews' }) {
  const queue = arrange(cardIds);
  const first = new Map(); // card id -> first answer right?
  const unlocked = new Set();
  const total = new Set(cardIds).size;
  let current = null;
  let answered = null; // { verdict, given, committed }

  root.innerHTML = `<section class="quiz mode-${mode}">
    <div class="quiz-top">
      <span class="quiz-title">${esc(title)}</span>
      <span class="quiz-progress" aria-live="polite"></span>
      <button type="button" class="btn small quiet quiz-end">${mode === 'review' ? 'End session' : 'Back to lesson'}</button>
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
    const [itemId, type] = splitCardId(current);
    const it = item(itemId);
    const reading = type !== 'm';
    stageEl.innerHTML = `
      <div class="q-card kind-${it.kind}" data-card="${esc(current)}">
        <div class="q-glyph ${it.kind === 'v' && it.w.length > 4 ? 'long' : ''}" lang="ja">${esc(glyph(it))}</div>
      </div>
      <div class="q-prompt ${reading ? 'is-reading' : 'is-meaning'}">${PROMPT[type](it)}</div>
      <form class="q-form" autocomplete="off">
        <input class="q-input" name="answer" ${reading ? 'lang="ja" placeholder="答え"' : 'placeholder="Your answer"'}
          autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="${esc(TYPE_LABEL[type])}">
        <button class="q-submit" aria-label="Submit">➜</button>
      </form>
      <p class="q-note" role="status"></p>
      <div class="q-after"></div>`;
    const input = stageEl.querySelector('.q-input');
    if (reading) bind(input, { IMEMode: 'toHiragana' });
    input.value = prefill;
    stageEl.querySelector('.q-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!answered) submit(input, it, type);
    });
    setTimeout(() => input.focus(), 0);
  }

  function submit(input, it, type) {
    const given = input.value;
    const res = type === 'm' ? checkMeaning(it, given, getSynonyms(it.id)) : checkReading(it, type, given);
    const note = stageEl.querySelector('.q-note');
    if (res.verdict === 'retry') {
      input.classList.remove('shake');
      void input.offsetWidth;
      input.classList.add('shake');
      note.textContent = res.note;
      note.className = 'q-note is-retry';
      input.select();
      return;
    }
    const ok = res.verdict === 'correct';
    answered = { ok, given, it, type };
    input.readOnly = true;
    try { unbind(input); } catch { /* not bound */ }
    stageEl.querySelector('.q-form').classList.add(ok ? 'is-right' : 'is-wrong');
    note.className = `q-note ${ok ? 'is-right' : 'is-wrong'}`;
    note.textContent = ok ? (res.note || '') : '';
    renderAfter();
    if (type === 'r' && getSettings().autoplay) speak(it.readings[0]);
  }

  function renderAfter(showInfo = false) {
    const { ok, it, type, given } = answered;
    const after = stageEl.querySelector('.q-after');
    const say = it.kind === 'v' ? speakerButton(it.readings[0]) : '';
    after.innerHTML = `
      <div class="q-answer">
        <span class="q-answer-label">${ok ? 'Answer' : 'Correct answer'}</span>
        <span class="q-answer-text">${expectedHtml(it, type)}</span> ${say}
      </div>
      <div class="q-actions">
        ${ok ? '' : '<button type="button" class="btn small q-undo" title="Backspace">Undo <kbd>⌫</kbd></button>'}
        ${!ok && type === 'm' && given.trim() ? `<button type="button" class="btn small q-syn">Accept “${esc(given.trim())}” as mine</button>` : ''}
        <button type="button" class="btn small q-info" title="F">${showInfo ? 'Hide' : 'Show'} details <kbd>F</kbd></button>
        <button type="button" class="btn small primary q-next">Next <kbd>⏎</kbd></button>
      </div>
      ${showInfo ? infoCardHtml(it, { compact: true }) : ''}`;
    after.querySelector('.q-undo')?.addEventListener('click', undo);
    after.querySelector('.q-syn')?.addEventListener('click', acceptAsSynonym);
    after.querySelector('.q-info').addEventListener('click', () => renderAfter(!showInfo));
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
    note.textContent = `Added “${answered.given.trim()}” to your meanings.`;
    renderAfter();
  }

  async function advance() {
    if (!answered) return;
    const { ok } = answered;
    const id = current;
    answered = null;
    if (!first.has(id)) {
      first.set(id, ok);
      if (mode === 'review') {
        const newly = await recordAnswer(id, ok);
        newly.forEach((x) => unlocked.add(x));
      }
    }
    queue.shift();
    if (!ok) {
      // Ask again a few cards later.
      const at = Math.min(queue.length, 3 + Math.floor(Math.random() * 4));
      queue.splice(at, 0, id);
    }
    next();
  }

  function finish(ended) {
    setKeys(null);
    const right = [...first.values()].filter(Boolean).length;
    const missed = [...new Set([...first].filter(([, v]) => !v).map(([id]) => splitCardId(id)[0]))];
    onDone({ total, answered: first.size, right, wrong: first.size - right, missed, unlocked: [...unlocked], ended, complete: !queue.length });
  }

  setKeys((e) => {
    if (!answered) return;
    if (e.key === 'Backspace' && !answered.ok) { e.preventDefault(); undo(); }
    else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      renderAfter(!stageEl.querySelector('.q-after').dataset.info);
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
