// Info cards: what's shown in lessons, after an answer, and on an item's page.

import { item, primaryMeaning, KIND_LABEL, glyph } from '../data.js';
import { esc, furiganaHtml, readingListHtml, tileHtml, READING_KIND, recallBadge } from '../ui.js';
import { stage, recall, getSynonyms, isIntroduced, STAGE_LABEL } from '../state.js';
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
  if (it.jlpt) meta.push(`JLPT N${it.jlpt}`);
  if (it.grade) meta.push(it.grade <= 6 ? `Grade ${it.grade}` : 'Secondary school');
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

function meaningsBlock(list, itemId) {
  const syn = getSynonyms(itemId);
  return `<section class="info-sec"><h3>Meanings</h3>
    <p class="meanings">${list.map((m, i) => `<span class="${i ? '' : 'primary'}">${esc(m)}</span>`).join('')}
    ${syn.map((s) => `<span class="syn" title="Your own answer">${esc(s)}</span>`).join('')}</p></section>`;
}

function radicalCard(it) {
  const orig = it.orig ? item('k:' + it.orig) : null;
  return `${header(it)}
    ${meaningsBlock([it.name, ...it.alt], it.id)}
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
    const target = item('r:' + c.ch) || item('k:' + c.ch);
    const glyphHtml = target ? `<a href="#item/${encodeURIComponent(target.id)}" lang="ja" class="inline-glyph">${esc(c.ch)}</a>` : `<span lang="ja" class="inline-glyph">${esc(c.ch)}</span>`;
    dict = `<p class="hint dict-radical">Dictionary radical (部首): ${glyphHtml} ${esc(c.name)}, no. ${c.n} of the 214 classical radicals. Dictionaries file the kanji under it.</p>`;
  }
  const body = it.prereq.length
    ? `<div class="parts-tree">${partsTree(it.prereq)}</div>`
    : '<p>A basic shape: it isn’t broken down into smaller parts, and it’s a building block for other kanji.</p>';
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
      <p class="hint">Bold readings are the common ones you'll be asked for. Tap a reading to hear it.</p>
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
      return `<li>${ks.map((k) => tileHtml(k, { stage: stage(k) })).join('')}
        <span class="kr-reading" lang="ja">${esc(rt)}</span>
        ${kind ? `<small class="rk rk-${kind}">${READING_KIND[kind]}</small>` : ''}</li>`;
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
