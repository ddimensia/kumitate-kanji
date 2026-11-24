// Small UI helpers: escaping, toasts, dialogs, furigana and item rendering.

import { glyph, primaryMeaning, KIND_LABEL, taughtReadings, kunFormsToShow, readingToSay, readingAnswers, item } from './data.js';
import { kunDisplay } from './answer.js';
import { parseKun } from './data.js';

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

const DAKU = { か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ', た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど', は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ' };
const HANDAKU = { は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ' };

const I_ROW = { う: 'い', く: 'き', ぐ: 'ぎ', す: 'し', つ: 'ち', ぬ: 'に', ぶ: 'び', む: 'み', る: 'り' };

/** A reading as it can appear in a word: as is, voiced (かみ → がみ, ほん → ぽん) or cut short (がく → がっ). */
function soundChanges(c) {
  const out = [c];
  if (DAKU[c[0]]) out.push(DAKU[c[0]] + c.slice(1));
  if (c[0] === 'ち' || c[0] === 'つ') out.push((c[0] === 'ち' ? 'じ' : 'ず') + c.slice(1)); // ちゅう -> じゅう, つま -> ずま
  if (HANDAKU[c[0]]) out.push(HANDAKU[c[0]] + c.slice(1));
  for (const x of [...out]) if (x.length >= 2 && 'つくちきり'.includes(x.at(-1))) out.push(x.slice(0, -1) + 'っ');
  return out;
}

/**
 * Where a kanji's reading in a word comes from, when it isn't the plain reading: 学校 がっ ->
 * がく, 手紙 がみ -> かみ, 建物 たて -> た(てる), 字引 びき -> ひ(く). Null when the reading is used
 * as is or can't be matched.
 */
export function baseReading(k, kind, rt) {
  if (kind === 'o') {
    for (const b of readingAnswers(k, 'on', { commonOnly: false })) {
      if (b === rt) return null;
      if (soundChanges(b).includes(rt)) return b;
    }
    return null;
  }
  const cands = [];
  for (const r of k.kun) {
    for (const f of r.forms) {
      const { stem, okuri } = parseKun(f);
      if (stem === rt) return null;
      const shown = kunDisplay(f);
      cands.push([stem, shown]);
      if (okuri) {
        const root = stem + okuri.slice(0, -1); // た(てる) -> たて, さ(がる) -> さが
        if (root !== stem) cands.push([root, shown]);
        if (I_ROW[okuri.at(-1)]) cands.push([root + I_ROW[okuri.at(-1)], shown]); // ひ(く) -> ひき
      }
    }
  }
  for (const [c, shown] of cands) if (soundChanges(c).includes(rt)) return shown;
  return null;
}

/**
 * Which reading each kanji uses in a word, for the answer after a reading question:
 * 学校 → 学 がっ on'yomi (from がく) + 校 こう on'yomi; 食べる → 食 た kun'yomi + べる.
 */
export function readingBreakdownHtml(v) {
  if (!v.furi || !v.furi.some(([ruby, rt]) => rt && [...ruby].some((c) => c >= '一'))) return '';
  const parts = v.furi.map(([ruby, rt, tag]) => {
    let kind = tag;
    if (!rt) return `<span class="rb-kana" lang="ja">${esc(ruby)}</span>`;
    const k = [...ruby].length === 1 ? item('k:' + ruby) : null;
    let base = k && (kind === 'o' || kind === 'k') ? baseReading(k, kind, rt) : null;
    if (k && !kind) {
      // Not tagged in the data: a sound-changed kun'yomi (切手 きっ from き(る)) or on'yomi.
      for (const kk of ['k', 'o']) {
        const b = baseReading(k, kk, rt);
        if (b) { kind = kk; base = b; break; }
      }
    }
    const label = kind === 'j' ? (v.furi.length === 1 ? 'special reading for the whole word' : 'special reading')
      : READING_KIND[kind] || 'special reading';
    return `<span class="rb-part"><span class="rb-kanji" lang="ja">${esc(ruby)}</span> <span class="rb-rt" lang="ja">${esc(rt)}</span>
      <small class="rk rk-${kind || 'x'}">${esc(label)}${base ? ` <span lang="ja">(from ${esc(base)})</span>` : ''}</small></span>`;
  });
  return `<p class="q-breakdown">${parts.join('<span class="rb-plus">+</span>')}</p>`;
}

/**
 * On'yomi in katakana, kun'yomi as stem(okurigana), in three tiers: taught with the kanji
 * (bold), common but met later through words (plain), and rare (grey).
 */
export function readingListHtml(it, kind, { rare = true } = {}) {
  const taught = taughtReadings(it)[kind];
  const tier = (r) => (taught.includes(r) ? 0 : r.common ? 1 : 2);
  const list = it[kind].filter((r) => rare || r.common);
  if (!list.length) return '<span class="muted">none</span>';
  const cls = ['taught', 'later', 'rare'];
  const title = ['Taught with this kanji', 'You’ll meet this in later words', 'Rarely used'];
  return list
    .slice()
    .sort((a, b) => tier(a) - tier(b))
    .map((r) => {
      const text = kind === 'on' ? r.forms.join('・') : kunFormsToShow(r).map(kunDisplay).join('・');
      // Other forms of the same kun'yomi (生: い(かす), い(ける)) are listed on hover.
      const more = kind === 'kun' ? r.forms.filter((f) => !kunFormsToShow(r).includes(f)).map(kunDisplay) : [];
      const tip = title[tier(r)] + (more.length ? `. Also: ${more.join('、')}` : '');
      return `<span lang="ja" class="reading ${cls[tier(r)]}" title="${esc(tip)}" data-say="${esc(readingToSay(kind, r))}">${esc(text)}</span>`;
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
