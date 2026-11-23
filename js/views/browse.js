// Browse every radical, kanji and word, coloured by how well you know it.

import { curriculum, meanings, primaryMeaning, item } from '../data.js';
import { stage, recall, STAGE_LABEL, STAGES, getSynonyms, LEVELS } from '../state.js';
import { esc, tileHtml, recallBadge, toast, confirmDialog, plural } from '../ui.js';
import { levelPickerHtml, wireLevelPicker } from './info.js';
import { toHiragana } from '../../vendor/wanakana.js';

const KINDS = { r: 'Radicals', k: 'Kanji', v: 'Vocabulary' };
const PAGE = 300;

function matches(it, q) {
  if (!q) return true;
  const g = it.kind === 'v' ? it.w : it.ch;
  if (g.includes(q)) return true;
  const kana = toHiragana(q);
  if (it.kind === 'v' && it.readings.some((r) => r.startsWith(kana))) return true;
  if (it.kind === 'k' && [...it.on, ...it.kun].some((r) => r.forms.some((f) => toHiragana(f.replace(/[.-]/g, '')).startsWith(kana)))) return true;
  const lq = q.toLowerCase();
  return [...meanings(it), ...getSynonyms(it.id)].some((m) => m.toLowerCase().includes(lq));
}

export function renderBrowse(root, params, navigate) {
  const kind = KINDS[params[0]] ? params[0] : 'k';
  const level = params[1] && /^[1-5]$/.test(params[1]) ? +params[1] : 0;
  const status = params[2] || 'all';
  let limit = PAGE;
  let query = '';

  root.innerHTML = `<section class="browse">
    <div class="browse-controls">
      <nav class="seg" aria-label="Kind">${Object.entries(KINDS).map(([k, l]) => `<a href="#browse/${k}/${level || 'all'}/${status}" class="${k === kind ? 'is-on' : ''}">${l}</a>`).join('')}</nav>
      <label>Level <select data-f="level"><option value="all">All</option>${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${n === level ? 'selected' : ''}>N${n}</option>`).join('')}</select></label>
      <label>Status <select data-f="status">
        <option value="all">All</option>
        <option value="studied" ${status === 'studied' ? 'selected' : ''}>Studied</option>
        <option value="weak" ${status === 'weak' ? 'selected' : ''}>Weak (under 80%)</option>
        <option value="new" ${status === 'new' ? 'selected' : ''}>Not studied</option>
      </select></label>
      <input type="search" class="browse-search" placeholder="Search meaning, reading or kanji" aria-label="Search">
      <button type="button" class="btn small" data-act="select">Select…</button>
    </div>
    <ul class="stage-legend">${STAGES.map((s) => `<li><i class="st-${s}"></i>${esc(STAGE_LABEL[s])}</li>`).join('')}</ul>
    <div class="level-radicals"></div>
    <p class="browse-count muted"></p>
    <div class="tiles grid"></div>
    <p><button type="button" class="btn more" hidden>Show more</button></p>
    <div class="select-bar" hidden>
      <div class="select-row">
        <b class="sel-count">0 selected</b>
        <button type="button" class="btn small" data-act="all">Select all shown</button>
        <button type="button" class="btn small" data-act="clear">Clear</button>
        <button type="button" class="btn small quiet" data-act="done">Done</button>
      </div>
      ${levelPickerHtml({ compact: true })}
    </div>
  </section>`;

  const grid = root.querySelector('.browse > .grid');
  const countEl = root.querySelector('.browse-count');
  const moreBtn = root.querySelector('.more');

  root.querySelectorAll('select[data-f]').forEach((s) => s.addEventListener('change', () => {
    const lv = root.querySelector('[data-f="level"]')?.value || 'all';
    const st = root.querySelector('[data-f="status"]').value;
    navigate(`browse/${kind}/${lv}/${st}`);
  }));

  function collect(k) {
    const db = curriculum();
    const now = new Date();
    const list = [];
    for (const id of db.order) {
      const it = db.items.get(id);
      if (it.kind !== k) continue;
      if (level && it.jlpt !== level) continue;
      const st = stage(it);
      const studied = st !== 'locked' && st !== 'available';
      if (status === 'studied' && !studied) continue;
      if (status === 'new' && studied) continue;
      let r = null;
      if (studied) r = recall(it, now);
      if (status === 'weak' && !(studied && r < 0.8)) continue;
      if (!matches(it, query)) continue;
      list.push({ it, st, r });
    }
    return list;
  }
  const tilesOf = (list) => list.map(({ it, st, r }) => tileHtml(it, { stage: st, extra: r !== null ? recallBadge(r) : '' })).join('');

  function draw() {
    const list = collect(kind);
    // On a level's kanji page, the radicals taught for that level come first.
    const rads = kind === 'k' && level ? collect('r') : [];
    root.querySelector('.level-radicals').innerHTML = rads.length
      ? `<h3>Radicals taught with N${level} kanji <small class="muted">(${rads.length})</small></h3><div class="tiles grid">${tilesOf(rads)}</div><h3>Kanji</h3>`
      : '';
    countEl.textContent = `${list.length} ${KINDS[kind].toLowerCase()}`;
    grid.innerHTML = tilesOf(list.slice(0, limit));
    moreBtn.hidden = list.length <= limit;
  }

  // Select mode: tap tiles to pick them, then set their level in one go.
  const selected = new Set();
  let selecting = false;
  const bar = root.querySelector('.select-bar');
  const idOf = (tile) => decodeURIComponent(tile.getAttribute('href').replace('#item/', ''));
  function refreshSelection() {
    root.querySelectorAll('.browse .tile').forEach((t) => t.classList.toggle('is-selected', selected.has(idOf(t))));
    root.querySelector('.sel-count').textContent = `${selected.size} selected`;
    root.querySelector('.level-picker button').disabled = !selected.size;
  }
  function setSelecting(on) {
    selecting = on;
    bar.hidden = !on;
    root.querySelector('.browse').classList.toggle('is-selecting', on);
    root.querySelector('[data-act="select"]').textContent = on ? 'Stop selecting' : 'Select…';
    if (!on) selected.clear();
    refreshSelection();
  }
  root.querySelector('[data-act="select"]').addEventListener('click', () => setSelecting(!selecting));
  root.querySelector('[data-act="done"]').addEventListener('click', () => setSelecting(false));
  root.querySelector('[data-act="clear"]').addEventListener('click', () => { selected.clear(); refreshSelection(); });
  root.querySelector('[data-act="all"]').addEventListener('click', () => {
    root.querySelectorAll('.browse .tile').forEach((t) => selected.add(idOf(t)));
    refreshSelection();
  });
  root.querySelector('.browse').addEventListener('click', (e) => {
    const tile = e.target.closest('.tile');
    if (!selecting || !tile) return;
    e.preventDefault();
    const id = idOf(tile);
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    refreshSelection();
  });
  wireLevelPicker(bar, () => [...selected].map(item).filter(Boolean), (n, level) => {
    toast(level === 'none' ? `Reset ${plural(n, 'item')}.` : `Set ${plural(n, 'item')} to ${LEVELS[level].label.split(' (')[0]}.`);
    selected.clear();
    draw();
    refreshSelection();
  }, (n) => confirmDialog({ title: 'Reset to not studied?', body: `Review history for ${plural(n, 'item')} will be cleared and they go back to lessons.`, confirm: 'Reset', danger: true }));

  moreBtn.addEventListener('click', () => { limit += PAGE; draw(); refreshSelection(); });
  let t = null;
  root.querySelector('.browse-search').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => { query = e.target.value.trim(); limit = PAGE; draw(); refreshSelection(); }, 150);
  });
  draw();
}

export { primaryMeaning };
