// Small UI helpers: escaping, toasts, dialogs, furigana and item rendering.

import { glyph, primaryMeaning, KIND_LABEL } from './data.js';
import { kunDisplay } from './answer.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer = null;
export function toast(msg, { error = false, ms = 3500 } = {}) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('is-error', error);
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), ms);
}

export function confirmDialog({ title, body, confirm = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'dialog';
    d.innerHTML = `<form method="dialog">
      <h2>${esc(title)}</h2>
      <p>${esc(body)}</p>
      <div class="dialog-actions">
        <button class="btn" value="cancel">Cancel</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" value="ok">${esc(confirm)}</button>
      </div></form>`;
    document.body.appendChild(d);
    d.addEventListener('close', () => { resolve(d.returnValue === 'ok'); d.remove(); });
    d.showModal();
  });
}

/** A word with furigana over its kanji. `highlight` marks one kanji's reading. */
export function furiganaHtml(it, { highlight = null, hide = false } = {}) {
  if (!it.furi) return `<span lang="ja">${esc(it.w)}</span>`;
  return `<span lang="ja" class="furi">${it.furi.map(([ruby, rt, kind]) => {
    if (!rt) return esc(ruby);
    const hl = highlight && ruby.includes(highlight) ? ' class="hl"' : '';
    return `<ruby${hl}>${esc(ruby)}<rt${kind ? ` data-k="${kind}"` : ''}>${hide ? '' : esc(rt)}</rt></ruby>`;
  }).join('')}</span>`;
}

export const READING_KIND = { o: "on'yomi", k: "kun'yomi", j: 'special reading' };

/** On'yomi in katakana, kun'yomi as stem(okurigana). Common readings first. */
export function readingListHtml(it, kind, { rare = true } = {}) {
  const list = it[kind].filter((r) => rare || r.common);
  if (!list.length) return '<span class="muted">none</span>';
  return list
    .slice()
    .sort((a, b) => b.common - a.common)
    .map((r) => {
      const text = kind === 'on' ? r.forms.join('・') : r.forms.filter((f) => !f.startsWith('-') || r.forms.length === 1).map(kunDisplay).join('・');
      return `<span lang="ja" class="reading${r.common ? ' common' : ' rare'}" data-say="${esc(kind === 'on' ? r.forms[0] : r.forms[0].replace(/[.-]/g, ''))}">${esc(text)}</span>`;
    })
    .join('');
}

/** Percentage badge for recall probability. */
export function recallBadge(r) {
  if (r === null || r === undefined) return '';
  const pct = Math.round(r * 100);
  const cls = pct >= 90 ? 'r-good' : pct >= 75 ? 'r-ok' : 'r-weak';
  return `<span class="recall ${cls}" title="Chance you'd recall it right now">${pct}%</span>`;
}

/** A small tile linking to an item's page. */
export function tileHtml(it, { stage = '', extra = '', showMeaning = true } = {}) {
  return `<a class="tile kind-${it.kind} ${stage ? 'st-' + stage : ''}" href="#item/${encodeURIComponent(it.id)}" title="${esc(KIND_LABEL[it.kind] + ': ' + primaryMeaning(it))}">
    <span class="tile-glyph" lang="ja">${esc(glyph(it))}</span>
    ${showMeaning ? `<span class="tile-meaning">${esc(primaryMeaning(it))}</span>` : ''}${extra}</a>`;
}

export function plural(n, one, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`;
}
