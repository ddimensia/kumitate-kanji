// Welcome page: what Kumitate Kanji is, shown on a first visit and from the footer's About link.

import { getSettings, introducedItems } from '../state.js';
import { item } from '../data.js';
import { esc, tileHtml } from '../ui.js';
import { speakerButton, wireSpeech } from '../speech.js';

const REPO = 'https://github.com/ddimensia/kumitate-kanji';
const KAKITORI = 'https://github.com/ddimensia/kakitori';
const TIP = 'https://ko-fi.com/ddimensia';

const STEPS = [
  { title: 'Learn the parts', text: 'Radicals first: the small shapes kanji are made of, each with a name to remember it by. 亻 is “person”, 氵 is “water”.' },
  { title: 'Build the kanji', text: 'Then the kanji built from them, with their meaning and the readings you’ll actually need soon. Other readings are shown and come later through words.' },
  { title: 'Use it in words', text: 'Then the words written with it, with furigana showing which reading each kanji takes, and audio.' },
  { title: 'Review over time', text: 'Each item comes back just before you’d forget it: hours, then days, then months. New items unlock as their parts settle into memory.' },
];

/** The assembly demo: two parts, the kanji they make, and a word using it. */
function assemblyHtml() {
  const tile = (id) => (item(id) ? tileHtml(item(id)) : '');
  const word = item('k:働')?.vocab.map(item).find((v) => v.w === '働く');
  return `<div class="w-assembly" aria-label="亻 (person) plus 動 (move) make 働 (work), used in the word 働く (to work)">
    <div class="w-row">${tile('r:亻')}<span class="plus">+</span>${tile('k:動')}</div>
    <span class="w-arrow" aria-hidden="true">↓</span>
    <div class="w-row">${tile('k:働')}</div>
    <span class="w-arrow" aria-hidden="true">↓</span>
    <div class="w-row">${word ? `<a class="tile kind-v w-word" href="#item/${encodeURIComponent(word.id)}"><span class="tile-glyph" lang="ja"><ruby>働<rt>はたら</rt></ruby>く</span><span class="tile-meaning">to work</span></a>${speakerButton(word.readings[0], 'Say はたらく')}` : ''}</div>
  </div>`;
}

export function renderWelcome(root) {
  const first = !getSettings().welcomed;
  const studied = introducedItems().length;
  const cta = first || !studied ? 'Start learning' : 'Go to today';

  root.innerHTML = `<article class="welcome">
    <section class="w-hero">
      <div class="w-intro">
        <h1><span class="w-title" lang="ja">組み立て漢字</span><span class="w-name">Kumitate Kanji</span></h1>
        <p class="w-lead">Learn kanji the way they’re built. Radicals make kanji, and kanji make words, so you learn each piece before what’s made from it. 組み立て (kumitate) means “assembly”.</p>
        <p class="w-lead">You’ll learn each kanji’s meaning and readings and the vocabulary that uses it, in JLPT order from N5 to N1. Answers are typed, and reviews are spaced so things stick.</p>
        <p class="hero-actions"><a class="btn primary big" href="#today">${cta}</a></p>
        <p class="w-note">Free, with no account. Your progress stays in this browser.</p>
      </div>
      <div class="w-demo">${assemblyHtml()}<p class="w-caption">Every kanji is taught after its parts, and every word after its kanji. Tap any of them to look closer.</p></div>
    </section>

    <section class="w-steps" aria-labelledby="w-steps-h">
      <h2 id="w-steps-h">How it works</h2>
      <ol>${STEPS.map((s, i) => `<li><h3><span class="w-step-n">${i + 1}</span>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`).join('')}</ol>
    </section>

    <section class="w-more">
      <div>
        <h2>Answering</h2>
        <ul>
          <li>Type meanings in English and readings in kana. Romaji turns into kana as you type: on’yomi in katakana, everything else in hiragana.</li>
          <li>A slip like ひるい for ひろい is a typo, not a miss: you get to try again. So does a reading of the wrong kind. Press Enter twice to give up.</li>
          <li>Wrong by accident? Backspace undoes it. You can also add your own meanings for anything.</li>
          <li>Missed items wait under Recent mistakes for extra practice that doesn’t upset their schedule.</li>
        </ul>
      </div>
      <div>
        <h2>What’s in it</h2>
        <ul>
          <li>2,211 kanji from the JLPT lists, 469 radicals and about 7,300 words, from open dictionary data.</li>
          <li>Already know some? Mark radicals, kanji or words at your level and they go straight to reviews. If you’ve studied on WaniKani, you can import your progress from Settings.</li>
          <li>New lessons come in small batches, up to 15 a day by default, fewer when reviews pile up.</li>
        </ul>
      </div>
      <div>
        <h2>Your progress stays with you</h2>
        <ul>
          <li>No account and no server. Everything is saved in this browser; export a backup now and then from Settings.</li>
          <li>Install it as an app from your browser, or add it to your home screen, and it works offline.</li>
          <li>Words and readings can be read aloud with your device’s Japanese voice.</li>
        </ul>
      </div>
    </section>

    <section class="w-end">
      <a class="btn primary big" href="#today">${cta}</a>
      <p class="w-note">Want to practise writing kanji by hand too? Try <a href="${KAKITORI}" target="_blank" rel="noopener">Kakitori</a> (書き取り), from the same maker.</p>
      <p class="w-note">Kumitate Kanji is free and open source under the MIT license; its course data is shared under CC BY-SA 4.0 (see <a href="#settings">Credits and licenses</a>). <a href="${REPO}" target="_blank" rel="noopener">Source code on GitHub</a>
        <br>If it helps you, you can <a href="${TIP}" target="_blank" rel="noopener">leave a tip on Ko-fi</a>.</p>
    </section>
  </article>`;
  wireSpeech(root);
}
