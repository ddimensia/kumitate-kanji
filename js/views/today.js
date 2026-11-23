// Today: lessons and reviews waiting, recall of what you've learned, overall progress.

import {
  allowance, availableLessonCount, dueCardIds, forecast, accuracy, stageCounts, weakest,
  recentlyLearned, STAGE_LABEL, isIntroduced, recentMistakes,
} from '../state.js';
import { curriculum } from '../data.js';
import { esc, tileHtml, recallBadge, plural } from '../ui.js';

const STUDIED = ['learning', 'fresh', 'settling', 'solid', 'mastered'];

function levelProgress() {
  const db = curriculum();
  const rows = [];
  for (const n of [5, 4, 3, 2, 1]) {
    let total = 0, learned = 0;
    for (const it of db.items.values()) {
      if (it.kind !== 'k' || it.jlpt !== n) continue;
      total++;
      if (isIntroduced(it)) learned++;
    }
    rows.push({ n, total, learned });
  }
  return rows;
}

export function renderToday(root, { startLessons, startReviews, startPractice }) {
  const allow = allowance();
  const available = availableLessonCount();
  const lessonsNow = Math.min(allow.remaining, available);
  const due = dueCardIds().length;
  const acc = accuracy(7);
  const counts = stageCounts();
  const studied = STUDIED.reduce((n, s) => n + counts[s], 0);
  const weak = weakest(10, 'rkv').filter((x) => x.r < 0.97);
  const recent = recentlyLearned(10, 'rk');

  const lessonNote = (() => {
    if (!available) return 'Nothing new is unlocked right now. Items unlock as what they’re built from settles in memory.';
    if (allow.remaining > 0) return `${allow.used} of today’s ${allow.limit} new items learned.${allow.limit < allow.max ? ` (Fewer than your ${allow.max}: ${allow.reasons.join('; ')}.)` : ''}`;
    if (allow.limit < allow.max) return `Today’s limit is ${allow.limit}, down from ${allow.max}, because ${allow.reasons.join(' and ')}. Catching up on reviews raises it again.`;
    return `You’ve learned today’s ${allow.limit} new items.`;
  })();

  const mistakes = recentMistakes();
  const mistakeCards = mistakes.items.reduce((n, m) => n + m.cards.length, 0);
  const sinceLabel = mistakes.since ? new Date(mistakes.since).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';

  const fc = forecast();
  const fcMax = Math.max(1, ...fc.map((b) => b.count));

  root.innerHTML = `<div class="today">
    <section class="hero-cards">
      <article class="hero lessons">
        <h2>Lessons</h2>
        <p class="hero-count">${lessonsNow}</p>
        <p class="hero-note">${esc(lessonNote)}</p>
        <div class="hero-actions">
          <button class="btn primary big" data-act="lessons" ${lessonsNow ? '' : 'disabled'}>Start lessons</button>
          ${available && !lessonsNow ? `<button class="btn" data-act="more">Learn ${Math.min(available, 5)} more anyway</button>` : ''}
          ${lessonsNow ? `<button class="btn quiet small" data-act="more">+ extra batch</button>` : ''}
        </div>
      </article>
      <article class="hero reviews">
        <h2>Reviews</h2>
        <p class="hero-count">${due}</p>
        <p class="hero-note">${acc.rate === null ? 'No reviews in the last week yet.' : `${Math.round(acc.rate * 100)}% right over the last 7 days (${plural(acc.n, 'answer')}).`}</p>
        <div class="hero-actions">
          <button class="btn primary big" data-act="reviews" ${due ? '' : 'disabled'}>Start reviews</button>
        </div>
        <ul class="forecast">${fc.map((b) => `<li><span>${esc(b.label)}</span><span class="fc-bar"><i style="width:${(b.count / fcMax) * 100}%"></i></span><b>${b.count}</b></li>`).join('')}</ul>
      </article>
    </section>

    ${mistakes.items.length ? `<section class="panel mistakes-panel">
      <h2>Recent mistakes</h2>
      <p class="hint">What you missed in your latest stretch of study (since ${esc(sinceLabel)}), in lessons and reviews. Extra study quizzes you on them without changing their review schedule.</p>
      <div class="tiles">${mistakes.items.slice(0, 30).map(({ it, misses }) => tileHtml(it, { extra: misses > 1 ? `<span class="recall r-weak">×${misses}</span>` : '' })).join('')}</div>
      <div class="hero-actions"><button class="btn" data-act="practice">Extra study (${plural(mistakeCards, 'card')})</button></div>
    </section>` : ''}

    ${studied ? `<section class="panel recall-panel">
      <h2>How well you know them</h2>
      <p class="hint">Percentages are the chance you’d recall an item right now, from its spaced-repetition history. Low ones are next in line for review.</p>
      <h3>Weakest right now</h3>
      ${weak.length ? `<div class="tiles">${weak.map(({ it, r }) => tileHtml(it, { extra: recallBadge(r) })).join('')}</div>` : '<p class="muted">Nothing below 97% at the moment.</p>'}
      <h3>Recently learned radicals and kanji</h3>
      <div class="tiles">${recent.map(({ it, r }) => tileHtml(it, { extra: recallBadge(r) })).join('') || '<p class="muted">None yet.</p>'}</div>
    </section>` : `<section class="panel welcome">
      <h2>Welcome to Kumitate Kanji</h2>
      <p>You’ll learn kanji in JLPT order, N5 first. Each kanji comes after the radicals it’s built from, and words come after their kanji. Answers are typed: meanings in English, readings in kana (type romaji and it turns into kana).</p>
      <p>Start with a lesson. New items unlock as earlier ones settle into memory, usually after your first successful review a couple of days later.</p>
    </section>`}

    <section class="panel progress-panel">
      <h2>Progress</h2>
      <div class="stage-bar">${STUDIED.map((s) => counts[s] ? `<span class="st-${s}" style="flex:${counts[s]}" title="${esc(STAGE_LABEL[s])}: ${counts[s]}"></span>` : '').join('') || '<span class="empty"></span>'}</div>
      <ul class="stage-legend">${STUDIED.map((s) => `<li><i class="st-${s}"></i>${esc(STAGE_LABEL[s])} <b>${counts[s]}</b></li>`).join('')}</ul>
      <h3>Kanji by JLPT level</h3>
      <ul class="levels">${levelProgress().map((l) => `<li><a href="#browse/k/${l.n}">N${l.n}</a><span class="lv-bar"><i style="width:${(l.learned / l.total) * 100}%"></i></span><span>${l.learned} / ${l.total}</span></li>`).join('')}</ul>
    </section>
  </div>`;

  root.querySelector('[data-act="lessons"]')?.addEventListener('click', () => startLessons(false));
  root.querySelectorAll('[data-act="more"]').forEach((b) => b.addEventListener('click', () => startLessons(true)));
  root.querySelector('[data-act="reviews"]')?.addEventListener('click', startReviews);
  root.querySelector('[data-act="practice"]')?.addEventListener('click', () => startPractice(mistakes.items.flatMap((m) => m.cards)));
}
