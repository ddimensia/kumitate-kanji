// Lessons: read through a batch of new items, then a quiz on all of them.
// Items only start their spaced-repetition schedule once the quiz is passed.

import { cardTypes, cardId, glyph, KIND_LABEL } from '../data.js';
import { introduceItems, allowance, lessonQueue, dueCardIds, getSettings } from '../state.js';
import { infoCardHtml } from './info.js';
import { runQuiz } from '../quiz.js';
import { esc, plural } from '../ui.js';
import { wireSpeech, speak } from '../speech.js';

const UNIT = { m: 'minute', h: 'hour', d: 'day' };
/** '4h' -> '4 hours' */
const waitLabel = (s) => {
  const n = parseFloat(s), u = UNIT[s.slice(-1)];
  return u ? `${n} ${u}${n === 1 ? '' : 's'}` : s;
};

/** Items for the next batch: within today's allowance, or one batch past it with `extra`. */
export function nextBatch(extra) {
  const size = getSettings().batchSize;
  const n = extra ? size : Math.min(size, allowance().remaining);
  return lessonQueue(n);
}

export function runLessons(root, batch, { setKeys, onExit, again }) {
  let index = 0;

  function showCards() {
    root.innerHTML = `<section class="lesson">
      <div class="lesson-top">
        <span class="quiz-title">Lesson</span>
        <nav class="lesson-tabs" aria-label="Items in this lesson">${batch.map((it, i) => `<button type="button" data-i="${i}" class="kind-${it.kind}" lang="ja">${esc(glyph(it))}</button>`).join('')}</nav>
        <button type="button" class="btn small quiet" data-act="exit">Leave</button>
      </div>
      <div class="lesson-card"></div>
      <div class="lesson-nav">
        <button type="button" class="btn" data-act="prev">← Back</button>
        <button type="button" class="btn primary" data-act="next">Next →</button>
      </div>
    </section>`;
    wireSpeech(root);
    root.querySelector('[data-act="exit"]').addEventListener('click', onExit);
    root.querySelector('[data-act="prev"]').addEventListener('click', () => go(index - 1));
    root.querySelector('[data-act="next"]').addEventListener('click', () => (index === batch.length - 1 ? startQuiz() : go(index + 1)));
    root.querySelectorAll('.lesson-tabs button').forEach((b) => b.addEventListener('click', () => go(+b.dataset.i)));
    setKeys((e) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); index === batch.length - 1 ? startQuiz() : go(index + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
    });
    go(index);
  }

  function go(i) {
    index = Math.max(0, Math.min(batch.length - 1, i));
    const it = batch[index];
    root.querySelector('.lesson-card').innerHTML = `<p class="lesson-step">${KIND_LABEL[it.kind]} ${index + 1} of ${batch.length}</p>${infoCardHtml(it, { compact: true })}`;
    root.querySelectorAll('.lesson-tabs button').forEach((b, k) => b.classList.toggle('is-on', k === index));
    root.querySelector('[data-act="prev"]').disabled = index === 0;
    root.querySelector('[data-act="next"]').textContent = index === batch.length - 1 ? 'Start quiz →' : 'Next →';
    if (it.kind === 'v' && getSettings().autoplay) speak(it.readings[0]);
    window.scrollTo({ top: 0 });
  }

  function startQuiz() {
    const ids = batch.flatMap((it) => cardTypes(it).map((t) => cardId(it.id, t)));
    runQuiz(root, ids, {
      mode: 'lesson',
      title: 'Lesson quiz',
      setKeys,
      onDone: async (res) => {
        if (!res.complete) { showCards(); return; }
        await introduceItems(batch);
        summary();
      },
    });
  }

  function summary() {
    const more = nextBatch(false);
    const due = dueCardIds().length;
    root.innerHTML = `<section class="panel summary">
      <h2>Learned ${plural(batch.length, 'new item')}</h2>
      <div class="tiles">${batch.map((it) => `<a class="tile kind-${it.kind}" href="#item/${encodeURIComponent(it.id)}"><span class="tile-glyph" lang="ja">${esc(glyph(it))}</span></a>`).join('')}</div>
      <p>They’ll come up for their first review in ${esc(waitLabel(getSettings().firstReview))}, then again over the next days.</p>
      <div class="hero-actions">
        ${more.length ? `<button class="btn primary" data-act="more">Next ${plural(more.length, 'lesson')}</button>` : ''}
        ${due ? `<button class="btn" data-act="reviews">${plural(due, 'review')} due</button>` : ''}
        <button class="btn" data-act="done">Done</button>
      </div>
    </section>`;
    root.querySelector('[data-act="more"]')?.addEventListener('click', () => again(false));
    root.querySelector('[data-act="reviews"]')?.addEventListener('click', () => again('reviews'));
    root.querySelector('[data-act="done"]').addEventListener('click', onExit);
    setKeys((e) => { if (e.key === 'Enter') { e.preventDefault(); (more.length ? () => again(false) : onExit)(); } });
  }

  showCards();
}
