// Reviews: every due card, shuffled. Ending early leaves the rest due.

import { runQuiz } from '../quiz.js';
import { item } from '../data.js';
import { tileHtml, plural } from '../ui.js';
import { stage, dueCardIds } from '../state.js';

export function runReviews(root, ids, { setKeys, onExit, again, practise }) {
  runQuiz(root, ids, {
    mode: 'review',
    title: 'Reviews',
    setKeys,
    onDone: (res) => {
      const pct = res.answered ? Math.round((res.right / res.answered) * 100) : 0;
      const left = dueCardIds().length;
      root.innerHTML = `<section class="panel summary">
        <h2>${res.answered ? `${pct}% right` : 'No answers this time'}</h2>
        <p>${plural(res.answered, 'card')} reviewed${res.ended && left ? `, ${left} still due` : ''}.</p>
        ${res.missed.length ? `<h3>Missed</h3><div class="tiles">${res.missed.map(item).map((it) => tileHtml(it, { stage: stage(it) })).join('')}</div>` : ''}
        ${res.unlocked.length ? `<h3>Newly unlocked</h3><p>${plural(res.unlocked.length, 'new item')} ready for lessons.</p>` : ''}
        <div class="hero-actions">
          ${left ? `<button class="btn primary" data-act="more">Keep going (${left})</button>` : ''}
          ${res.missedCards.length ? `<button class="btn" data-act="practise" title="Extra study: doesn’t change when they’re next due">Practise the ${res.missedCards.length > 1 ? `${res.missedCards.length} missed` : 'missed one'}</button>` : ''}
          <button class="btn ${left ? '' : 'primary'}" data-act="done">Done</button>
        </div>
      </section>`;
      root.querySelector('[data-act="more"]')?.addEventListener('click', () => again('reviews'));
      root.querySelector('[data-act="practise"]')?.addEventListener('click', () => practise(res.missedCards));
      root.querySelector('[data-act="done"]').addEventListener('click', onExit);
      setKeys((e) => { if (e.key === 'Enter') { e.preventDefault(); onExit(); } });
    },
  });
}
