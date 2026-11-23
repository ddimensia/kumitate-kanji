// Settings, backup and credits.

import { getSettings, saveSettings, DEFAULT_SETTINGS } from '../state.js';
import { exportAll, importAll, wipeAll } from '../store.js';
import { curriculum } from '../data.js';
import { japaneseVoices, speak, speechAvailable } from '../speech.js';
import { esc, toast, confirmDialog } from '../ui.js';

export function renderSettings(root, reload) {
  const s = getSettings();
  const voices = japaneseVoices();
  const src = curriculum().sources;

  root.innerHTML = `<div class="settings">
    <form class="panel settings-form">
      <h2>Pace</h2>
      <label class="row"><span>New items a day, at most</span>
        <input type="number" name="dailyMax" min="0" max="200" value="${s.dailyMax}"></label>
      <label class="row check"><input type="checkbox" name="adaptive" ${s.adaptive ? 'checked' : ''}>
        <span>Adjust to how I’m doing<small>Fewer new items when 7-day accuracy is under 90% (none at 70%) or more than 150 reviews are waiting. You can always learn an extra batch from Today.</small></span></label>
      <label class="row"><span>Items per lesson batch</span>
        <input type="number" name="batchSize" min="1" max="20" value="${s.batchSize}"></label>
      <label class="row"><span>Target recall<small>Higher means more frequent reviews.</small></span>
        <select name="retention">${[0.8, 0.85, 0.9, 0.93, 0.95].map((r) => `<option value="${r}" ${r === s.retention ? 'selected' : ''}>${Math.round(r * 100)}%</option>`).join('')}</select></label>
      <label class="row"><span>First review after a lesson<small>How long new items cool off before you're quizzed on them.</small></span>
        <select name="firstReview">${[['10m', '10 minutes'], ['1h', '1 hour'], ['2h', '2 hours'], ['4h', '4 hours'], ['8h', '8 hours']].map(([v, l]) => `<option value="${v}" ${v === s.firstReview ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="row"><span>Missed cards come back after</span>
        <select name="missReview">${[['10m', '10 minutes'], ['30m', '30 minutes'], ['1h', '1 hour'], ['4h', '4 hours']].map(([v, l]) => `<option value="${v}" ${v === s.missReview ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="row"><span>Unlock after<small>Memory stability an item needs before kanji and words built on it unlock.</small></span>
        <select name="unlockStability">${[1, 2, 3, 5, 7].map((d) => `<option value="${d}" ${d === s.unlockStability ? 'selected' : ''}>${d} day${d > 1 ? 's' : ''}</option>`).join('')}</select></label>
      <label class="row"><span>New day starts at</span>
        <select name="dayStartHour">${[0, 2, 3, 4, 5, 6].map((h) => `<option value="${h}" ${h === s.dayStartHour ? 'selected' : ''}>${h}:00</option>`).join('')}</select></label>

      <h2>Audio</h2>
      ${speechAvailable() ? '' : '<p class="warn">This browser has no Japanese voice. On most systems you can add one in the OS language or speech settings.</p>'}
      <label class="row check"><input type="checkbox" name="autoplay" ${s.autoplay ? 'checked' : ''}>
        <span>Say words aloud after I answer their reading</span></label>
      <label class="row"><span>Voice</span>
        <select name="voice"><option value="">Best available</option>${voices.map((v) => `<option ${v === s.voice ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      <label class="row"><span>Speed</span>
        <input type="range" name="rate" min="0.6" max="1.2" step="0.05" value="${s.rate}"></label>
      <p><button type="button" class="btn small" data-act="test">Test: 日本語を勉強しています</button></p>
      <p class="hint">Changes save as you make them.</p>
    </form>

    <section class="panel">
      <h2>Backup</h2>
      <p>Your progress lives only in this browser. Export a backup now and then, especially before clearing browser data.</p>
      <p class="hero-actions">
        <button class="btn" data-act="export">Export backup</button>
        <label class="btn">Import backup<input type="file" accept="application/json,.json" data-act="import" hidden></label>
        <button class="btn danger" data-act="wipe">Erase all progress</button>
      </p>
    </section>

    <section class="panel credits">
      <h2>Credits and licenses</h2>
      <ul>
        <li>Kanji meanings, readings, school grades and frequency: <a href="https://www.edrdg.org/wiki/index.php/KANJIDIC_Project">KANJIDIC2</a>; words: <a href="https://www.edrdg.org/jmdict/j_jmdict.html">JMdict</a>. Both from the Electronic Dictionary Research and Development Group, used under <a href="https://www.edrdg.org/edrdg/licence.html">CC BY-SA 4.0</a>, via <a href="https://github.com/scriptin/jmdict-simplified">jmdict-simplified</a>${src?.jmdict?.dictDate ? ` (dictionary date ${esc(src.jmdict.dictDate)})` : ''}.</li>
        <li>Kanji components: <a href="https://kanjivg.tagaini.net/">KanjiVG</a> by Ulrich Apel and contributors, CC BY-SA 3.0.</li>
        <li>Furigana alignment: <a href="https://github.com/Doublevil/JmdictFurigana">JmdictFurigana</a>, CC BY-SA 4.0.</li>
        <li>JLPT levels: Jonathan Waller’s lists from <a href="https://www.tanos.co.uk/jlpt/">tanos.co.uk</a>, CC BY, via Bluskyo/JLPT_Vocabulary and open-anki-jlpt-decks. The JLPT publishes no official lists.</li>
        <li>Scheduling: <a href="https://github.com/open-spaced-repetition/ts-fsrs">ts-fsrs</a> (MIT). Kana input: <a href="https://github.com/WaniKani/WanaKana">WanaKana</a> (MIT).</li>
        <li>Fonts: Klee One and Zen Kaku Gothic New (SIL Open Font License 1.1).</li>
      </ul>
      <p class="hint">The course data (data/curriculum.json) is shared under CC BY-SA 4.0.</p>
    </section>
  </div>`;

  const form = root.querySelector('.settings-form');
  form.addEventListener('change', async (e) => {
    const el = e.target;
    if (!el.name) return;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'number') {
      v = Math.round(+el.value);
      if (!Number.isFinite(v)) v = DEFAULT_SETTINGS[el.name];
      v = Math.max(+el.min, Math.min(+el.max, v));
      el.value = v;
    } else if (['retention', 'rate', 'unlockStability', 'dayStartHour'].includes(el.name)) v = +el.value;
    else v = el.value;
    await saveSettings({ [el.name]: v });
    toast('Saved.', { ms: 1200 });
  });
  root.querySelector('[data-act="test"]').addEventListener('click', () => {
    if (!speak('にほんごをべんきょうしています')) toast('Speech isn’t available in this browser.', { error: true });
  });

  root.querySelector('[data-act="export"]').addEventListener('click', async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `yomitori-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  root.querySelector('[data-act="import"]').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const ok = await confirmDialog({ title: 'Replace your progress?', body: 'Importing replaces everything in this browser with the backup.', confirm: 'Import', danger: true });
      if (!ok) return;
      await importAll(data);
      await reload();
      toast('Backup imported.');
    } catch (err) {
      toast(err.message || 'That file couldn’t be read.', { error: true });
    }
  });
  root.querySelector('[data-act="wipe"]').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Erase all progress?', body: 'Every card, review and setting in this browser will be deleted. Export a backup first if you might want it back.', confirm: 'Erase everything', danger: true });
    if (!ok) return;
    await wipeAll();
    await reload();
    toast('Progress erased.');
  });
}
