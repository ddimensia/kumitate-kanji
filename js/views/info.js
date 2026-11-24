// Info cards: what's shown in lessons, after an answer, and on an item's page.

import { item, primaryMeaning, KIND_LABEL, glyph, meaningWord } from '../data.js';
import { esc, furiganaHtml, readingListHtml, tileHtml, READING_KIND, recallBadge, baseReading } from '../ui.js';
import { stage, recall, getSynonyms, isIntroduced, STAGE_LABEL, addSynonym, removeSynonym, LEVELS, setLevel, unstudiedParts } from '../state.js';
import { speakerButton } from '../speech.js';

// In lessons and quizzes (compact), long lists start collapsed so the buttons stay in view.
let compactMode = false;
function section(title, count, body, { long = true } = {}) {
  if (compactMode && long) {
    return `<details class="info-sec fold"><summary><h3>${title} <small>(${count})</small></h3></summary>${body}</details>`;
  }
  return `<section class="info-sec"><h3>${title}</h3>${body}</section>`;
}

const tiles = (ids, n = 24) =>
  ids.slice(0, n).map(item).filter(Boolean).map((it) => tileHtml(it, { stage: stage(it) })).join('');

function header(it) {
  const st = stage(it);
  const meta = [];
  if (it.jlpt) meta.push(it.kind === 'r' ? `Taught with N${it.jlpt} kanji` : `JLPT N${it.jlpt}`);
  if (it.grade) meta.push(it.grade <= 6 ? `Grade ${it.grade}` : it.grade === 8 ? 'Secondary school' : 'Name kanji (jinmeiyō)');
  if (it.strokes) meta.push(`${it.strokes} strokes`);
  if (it.kind === 'v' && it.pos.length) meta.push(it.pos.join(', '));
  const big = it.kind === 'v'
    ? `<div class="info-glyph word">${furiganaHtml(it)}</div>`
    : `<div class="info-glyph" lang="ja">${esc(it.ch)}</div>`;
  const say = it.kind === 'v' ? speakerButton(it.readings[0], `Say ${it.readings[0]}`) : '';
  return `<header class="info-head kind-${it.kind}">
    ${big}
    <div class="info-title">
      <span class="kind-badge kind-${it.kind}">${KIND_LABEL[it.kind]}</span>
      <h2>${esc(primaryMeaning(it))} ${say}</h2>
      <p class="info-meta">${meta.map(esc).join(' · ')}</p>
      ${isIntroduced(it) ? `<p class="info-stage st-${st}">${STAGE_LABEL[st]} ${recallBadge(recall(it))}</p>` : ''}
    </div>
  </header>`;
}

function meaningsBlock(list, itemId, word = 'meaning') {
  const syn = getSynonyms(itemId);
  return `<section class="info-sec"><h3>${word === 'name' ? (list.length > 1 ? 'Names' : 'Name') : 'Meanings'}</h3>
    <p class="meanings">${list.map((m, i) => `<span class="${i ? '' : 'primary'}">${esc(m)}</span>`).join('')}
    ${syn.map((s) => `<span class="syn" title="Your own answer">${esc(s)}</span>`).join('')}</p></section>`;
}

function radicalCard(it) {
  const orig = it.orig ? item('k:' + it.orig) : null;
  return `${header(it)}
    ${meaningsBlock([it.name, ...it.alt], it.id, meaningWord(it))}
    ${it.note ? `<section class="info-sec"><h3>Note</h3><p class="radical-note">${esc(it.note).replace(/[\u3400-\u9fff]/g, (c) => `<span lang="ja" class="nj">${c}</span>`)}</p></section>` : ''}
    ${item('k:' + it.ch) ? `<section class="info-sec"><h3>Also a kanji</h3><div class="tiles">${tileHtml(item('k:' + it.ch), { stage: stage(item('k:' + it.ch)) })}</div><p class="hint">On its own, ${esc(it.ch)} is a kanji you’ll learn with its readings.</p></section>` : ''}
    ${it.orig ? `<section class="info-sec"><h3>Form of</h3><p>A variant of <span lang="ja" class="inline-glyph">${esc(it.orig)}</span>${orig ? ` (${esc(primaryMeaning(orig))})` : ''}, as it appears inside other kanji.</p></section>` : ''}
    ${it.users.length ? section('Found in', it.users.length, `<div class="tiles">${tiles(it.users)}</div>`) : ''}`;
}

/**
 * The parts a kanji is built from, one level further for parts that are kanji: 働 = 亻 + 動 (= 重 + 力).
 * Each part is a tile linking to its own card.
 */
function partsTree(ids, depth = 0) {
  return ids.map(item).filter(Boolean).map((p) => {
    const tile = tileHtml(p, { stage: stage(p) });
    const sub = p.kind === 'k' && p.prereq.length && depth < 1
      ? `<span class="parts-sub"><span class="eq">=</span>${partsTree(p.prereq, depth + 1)}</span>` : '';
    return `<span class="part">${tile}${sub}</span>`;
  }).join('<span class="plus">+</span>');
}

function radicalsSection(it) {
  const c = it.classical;
  let dict = '';
  if (c) {
    // Linked to the form the course teaches: 艸 -> 艹, 阜 -> ⻖, 靑 -> 青.
    const target = c.id ? item(c.id) : null;
    const shown = target && target.ch !== c.ch ? ` (taught as <span lang="ja">${esc(target.ch)}</span>)` : '';
    const glyphHtml = target
      ? `<a href="#item/${encodeURIComponent(target.id)}" class="dict-link"><span lang="ja" class="inline-glyph">${esc(c.ch)}</span>${shown}</a>`
      : `<span lang="ja" class="inline-glyph">${esc(c.ch)}</span>`;
    dict = `<p class="hint dict-radical">Dictionary radical (部首): ${glyphHtml} ${esc(c.name)}, no. ${c.n} of the 214 classical radicals. Dictionaries file the kanji under it.</p>`;
  }
  const own = it.prereq.length === 1 && it.prereq[0] === 'r:' + it.ch;
  const body = `<div class="parts-tree">${partsTree(it.prereq)}</div>${own
    ? `<p class="hint">A basic shape: this kanji is its own radical, which you learn first and then meet inside other kanji.</p>` : ''}`;
  return `<section class="info-sec"><h3>Radicals</h3>${body}${dict}</section>`;
}

function kanjiCard(it) {
  const juku = it.juku.map(item).filter(Boolean);
  const vocab = it.vocab.map(item).filter(Boolean);
  const hasKun = it.kun.length > 0;
  return `${header(it)}
    ${meaningsBlock(it.meanings, it.id)}
    <section class="info-sec readings-sec"><h3>Readings</h3>
      <dl class="readings">
        <dt>On'yomi <small>音読み</small></dt><dd>${readingListHtml(it, 'on')}</dd>
        ${hasKun ? `<dt>Kun'yomi <small>訓読み</small></dt><dd>${readingListHtml(it, 'kun')}</dd>` : ''}
        ${juku.length ? `<dt>Special <small>熟字訓</small></dt><dd>${juku.map((v) => `<span class="juku" data-say="${esc(v.readings[0])}">${furiganaHtml(v)}</span>`).join('')}</dd>` : ''}
      </dl>
      <p class="hint"><span class="reading taught" style="font-size:inherit">Highlighted</span>: taught and quizzed with this kanji. Plain: you’ll meet it later in words. Grey: rare. Tap a reading to hear it.</p>
    </section>
    ${radicalsSection(it)}
    ${it.usedIn.length ? section('Part of', it.usedIn.length, `<div class="tiles">${tiles(it.usedIn, 12)}</div>`) : ''}
    ${vocab.length ? section('Words', vocab.length, `<ul class="wordlist">${vocab.slice(0, 12).map((v) => wordRow(v, it.ch)).join('')}</ul>`, { long: vocab.length > 3 }) : ''}`;
}

function wordRow(v, highlight) {
  const seg = v.furi?.find(([ruby]) => ruby.includes(highlight));
  const kind = seg?.[2] ? `<small class="rk rk-${seg[2]}">${READING_KIND[seg[2]]}</small>` : '';
  return `<li><a href="#item/${encodeURIComponent(v.id)}">${furiganaHtml(v, { highlight })}</a>
    <span class="wl-meaning">${esc(v.senses[0].slice(0, 3).join('; '))}</span>${kind}</li>`;
}

function vocabCard(it) {
  const kanjiRows = (it.furi || [])
    .filter(([ruby, rt]) => rt && [...ruby].some((c) => c >= '一'))
    .map(([ruby, rt, kind]) => {
      const ks = [...ruby].map((c) => item('k:' + c)).filter(Boolean);
      const base = ks.length === 1 && (kind === 'o' || kind === 'k') ? baseReading(ks[0], kind, rt) : null;
      return `<li>${ks.map((k) => tileHtml(k, { stage: stage(k) })).join('')}
        <span class="kr-reading" lang="ja">${esc(rt)}</span>
        ${kind ? `<small class="rk rk-${kind}">${READING_KIND[kind]}${base ? ` <span lang="ja">(from ${esc(base)})</span>` : ''}</small>` : ''}</li>`;
    });
  return `${header(it)}
    <section class="info-sec"><h3>Reading</h3>
      <p class="vreadings">${it.readings.map((r) => `<span lang="ja" class="reading common" data-say="${esc(r)}">${esc(r)}</span>`).join('')}</p></section>
    <section class="info-sec"><h3>Meanings</h3>
      <ol class="senses">${it.senses.map((s) => `<li>${esc(s.join('; '))}</li>`).join('')}</ol>
      ${getSynonyms(it.id).length ? `<p class="meanings">${getSynonyms(it.id).map((s) => `<span class="syn">${esc(s)}</span>`).join('')}</p>` : ''}
    </section>
    ${kanjiRows.length ? `<section class="info-sec"><h3>Kanji</h3><ul class="kanji-rows">${kanjiRows.join('')}</ul></section>` : ''}`;
}

export function infoCardHtml(it, { compact = false } = {}) {
  compactMode = compact;
  const body = it.kind === 'r' ? radicalCard(it) : it.kind === 'k' ? kanjiCard(it) : vocabCard(it);
  return `<article class="info kind-${it.kind}" data-item="${esc(it.id)}">${body}</article>`;
}

export { glyph };

/** Your own extra meanings for an item, with a box to add more. */
export function synonymEditorHtml(it) {
  const syn = getSynonyms(it.id);
  const word = meaningWord(it);
  return `<div class="syn-editor" data-item="${esc(it.id)}">
    <span class="syn-label">Your ${word}s:</span>
    ${syn.map((s) => `<span class="syn-chip">${esc(s)}<button type="button" class="syn-rm" data-rm="${esc(s)}" aria-label="Remove ${esc(s)}">✕</button></span>`).join('') || '<span class="muted">none yet</span>'}
    <form class="syn-add"><input name="syn" placeholder="Add a ${word}" aria-label="Add a ${word}" autocomplete="off"><button class="btn small">Add</button></form>
  </div>`;
}

/** Wire every synonym editor inside `root`; `onChange` re-renders whatever shows them. */
export function wireSynonymEditors(root, onChange) {
  root.querySelectorAll('.syn-editor').forEach((ed) => {
    const id = ed.dataset.item;
    ed.querySelector('.syn-add').addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const v = e.target.syn.value.trim();
      if (!v) return;
      await addSynonym(id, v);
      onChange(id, v);
    });
    ed.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
      await removeSynonym(id, b.dataset.rm);
      onChange(id);
    }));
  });
}


/**
 * Controls to put items straight at a level ("I already know these"). `getItems` returns
 * the items to change when Apply is pressed; `onDone(count)` runs afterwards.
 */
export function levelPickerHtml({ partsCount = null, compact = false } = {}) {
  return `<form class="level-picker${compact ? ' compact' : ''}">
    <label>Set my level <select name="level">
      ${Object.entries(LEVELS).map(([k, l]) => `<option value="${k}" ${k === 'solid' ? 'selected' : ''}>${esc(l.label)}</option>`).join('')}
      <option value="none">Not studied (back to lessons)</option>
    </select></label>
    <label class="check"><input type="checkbox" name="parts" checked> Also mark the radicals and kanji they’re built from${partsCount !== null ? ` (${partsCount} not studied yet)` : ''}</label>
    <button class="btn small primary">Apply</button>
  </form>`;
}

export function wireLevelPicker(root, getItems, onDone, confirmFn) {
  const form = root.querySelector('.level-picker');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const level = form.level.value;
    let items = getItems();
    if (!items.length) return;
    if (form.parts.checked && level !== 'none') {
      const seen = new Set(items.map((it) => it.id));
      const extra = [];
      for (const it of items) for (const p of unstudiedParts(it)) if (!seen.has(p.id)) { seen.add(p.id); extra.push(p); }
      items = [...extra, ...items];
    }
    if (level === 'none' && confirmFn && !(await confirmFn(items.length))) return;
    await setLevel(items, level);
    onDone(items.length, level);
  });
}
