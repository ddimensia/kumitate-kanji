// One item's page: its info card, your progress on each question, and your own meanings.

import { item, cardTypes, TYPE_LABEL } from '../data.js';
import { itemHistory, getSynonyms, addSynonym, removeSynonym, resetItem, isIntroduced, isUnlocked, isPassed, recall } from '../state.js';
import { retrievability, formatInterval } from '../srs.js';
import { infoCardHtml } from './info.js';
import { esc, confirmDialog, toast } from '../ui.js';
import { wireSpeech } from '../speech.js';

export function renderItem(root, id, rerender) {
  const it = item(id);
  if (!it) { root.innerHTML = '<p class="panel">That item isn’t in the course.</p>'; return; }
  const now = Date.now();
  const hist = itemHistory(it);
  const locked = !isIntroduced(it) && !isUnlocked(it);
  const waiting = it.prereq.map(item).filter((p) => p && !isPassed(p.id));

  root.innerHTML = `<div class="item-page">
    ${infoCardHtml(it)}
    <section class="panel">
      <h2>Your progress</h2>
      ${hist.length ? `<table class="hist"><thead><tr><th>Question</th><th>Recall now</th><th>Next review</th><th>Memory</th><th>Right / wrong</th></tr></thead><tbody>
        ${hist.map((h) => `<tr><td>${esc(TYPE_LABEL[h.type])}</td>
          <td>${Math.round(retrievability(h.srs) * 100)}%</td>
          <td>${Date.parse(h.srs.due) <= now ? 'due now' : 'in ' + formatInterval(Date.parse(h.srs.due) - now)}</td>
          <td>${h.srs.stability ? formatInterval(h.srs.stability * 86400000) : '–'}</td>
          <td>${h.right} / ${h.wrong}</td></tr>`).join('')}
      </tbody></table>
      <p class="hint">“Memory” is how long until recall would drop to 90% without review (FSRS stability). Overall recall right now: ${Math.round(recall(it) * 100)}%.</p>`
      : locked ? `<p>Locked. It unlocks once you know ${waiting.map((p) => `<a href="#item/${encodeURIComponent(p.id)}" lang="ja">${esc(p.ch || p.w)}</a>`).join(', ')} well enough.</p>`
        : '<p>Not studied yet. It’s in your lesson queue.</p>'}
      <h3>Your meanings</h3>
      <p class="hint">Extra English answers you want accepted for this ${it.kind === 'r' ? 'radical' : it.kind === 'k' ? 'kanji' : 'word'}.</p>
      <ul class="syn-list">${getSynonyms(it.id).map((s) => `<li>${esc(s)} <button type="button" class="btn tiny quiet" data-rm="${esc(s)}" aria-label="Remove ${esc(s)}">✕</button></li>`).join('')}</ul>
      <form class="syn-add"><input name="syn" placeholder="Add a meaning" aria-label="Add a meaning"> <button class="btn small">Add</button></form>
      ${hist.length ? `<p><button type="button" class="btn small danger" data-act="reset">Reset this item</button></p>` : ''}
    </section>
  </div>`;
  wireSpeech(root);
  root.querySelector('.syn-add').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = e.target.syn.value.trim();
    if (!v) return;
    await addSynonym(it.id, v);
    rerender();
  });
  root.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => { await removeSynonym(it.id, b.dataset.rm); rerender(); }));
  root.querySelector('[data-act="reset"]')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Reset this item?',
      body: `Its ${cardTypes(it).length > 1 ? 'questions go' : 'question goes'} back to the lesson queue and its review history is cleared. Items it unlocked stay unlocked.`,
      confirm: 'Reset', danger: true,
    });
    if (!ok) return;
    await resetItem(it);
    toast('Item reset.');
    rerender();
  });
}
