// Extra study: practise recently missed cards without touching their review schedule.

import { runQuiz } from '../quiz.js';
import { item, splitCardId } from '../data.js';
import { tileHtml, plural } from '../ui.js';
import { stage } from '../state.js';

export function runPractice(root, ids, { setKeys, onExit, again }) {
  runQuiz(root, ids, {
    mode: 'practice',
    title: 'Extra study',
    setKeys,
    onDone: (res) => {
      const pct = res.answered ? Math.round((res.right / res.answered) * 100) : 0;
      const items = [...new Set(ids.map((id) => splitCardId(id)[0]))];
      root.innerHTML = `<section class="panel summary">
        <h2>${res.answered ? `${pct}% right first time` : 'No answers this time'}</h2>
        <p>${plural(res.answered, 'card')} practised. Extra study doesn’t change when items come up for review.</p>
        ${res.missed.length ? `<h3>Still shaky</h3><div class="tiles">${res.missed.map(item).map((it) => tileHtml(it, { stage: stage(it) })).join('')}</div>` : ''}
        <div class="hero-actions">
          <button class="btn primary" data-act="again">Practise ${items.length > 1 ? 'these' : 'it'} again</button>
          <button class="btn" data-act="done">Done</button>
        </div>
      </section>`;
      root.querySelector('[data-act="again"]').addEventListener('click', () => again());
      root.querySelector('[data-act="done"]').addEventListener('click', onExit);
      setKeys((e) => { if (e.key === 'Enter') { e.preventDefault(); onExit(); } });
    },
  });
}
