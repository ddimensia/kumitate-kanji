# Yomitori 読み取り

Learn kanji radicals, kanji with their on'yomi and kun'yomi, and the vocabulary that uses them, with typed answers and spaced repetition. It's the reading counterpart to [Kakitori](https://github.com/ddimensia/kakitori) (書き取り, writing).

Everything runs in the browser. There is no server and no account: progress is stored in IndexedDB, and the host only serves static files.

## How it works

**Order.** Kanji follow the JLPT lists, N5 first, by newspaper frequency within each level (2,211 kanji). Before each kanji come the components it's built from, and after it come the words written with it (about 7,300).

**Radicals.** Components come from KanjiVG's stroke groups, so they nest the way KanjiDamage's do: 働 = 亻 + 動, and 動 = 重 + 力. A part that is a kanji on the list at the same JLPT level, or one level up, is taught as a full kanji first. Any other part is taught as a radical (meaning only): about 400 of them. A radical that is also a kanji takes the kanji's name. The exception is a well-known radical name: the 214 classical radicals (囗 "enclosure") and the side and top forms (亻 "person", 氵 "water", 艹 "grass"), named in `tools/radical_names.py`. Single strokes are skipped. Kanji cards show the breakdown one level deep (働 = 亻 + 動 (= 重 + 力)) and the dictionary radical (部首).

**Questions.** Each item has its own cards, each with its own FSRS schedule:

| Item | Cards |
| --- | --- |
| Radical | meaning |
| Kanji | meaning, on'yomi (if it has a common one), kun'yomi (if it has a common one) |
| Word | meaning, reading |

Only common readings are asked for. A reading counts as common when it appears in enough common or JLPT words (counted from JmdictFurigana, allowing for rendaku and small っ), or when the kanji on its own is a word read that way (上 うえ, 明るい). Info cards list all readings, with rare ones greyed out, plus special readings (jukujikun such as 今日 きょう).

**Answers.** Meanings are typed in English and readings in kana. Romaji turns into kana as you type, via WanaKana. When an answer isn't graded right, one of four things happens:

- **Close spelling** of a meaning is accepted. Swapped letters count as one slip ("wrok" for "work").
- **Typo in a reading** (one kana off, as in ひるい for ひろい) isn't graded. The card shakes and you try again. Long vowels, small kana and dakuten are real distinctions, so こ for こう or か for が still counts as wrong.
- **Wrong kind of answer** isn't graded either: a kun'yomi when the on'yomi was asked, the kanji's reading for a word read differently, or a reading typed into a meaning question.
- **Undo** (Backspace) reverts a wrong answer so you can fix it, as on Bunpro. You can also accept your wording as one of your own meanings.

**Unlocking.** An item unlocks the kanji and words built on it once every one of its cards has reached 3 days of FSRS stability. In practice that means after the lesson, the 10-minute review and the first review two days later.

**Pace.** Lessons come in batches (5 by default) up to a daily maximum (15 by default). With adaptive pacing on, the daily number shrinks when your 7-day accuracy falls below 90% (to zero at 70%) or when more than 150 reviews are waiting. **Learn more anyway** on the Today page always allows another batch.

**Recall.** Today shows your weakest and most recently learned items, each with the current chance you'd recall it. Browse colours every radical, kanji and word by stage, from learning to mastered.

**Audio.** Words and readings are spoken with the browser's Japanese voice (Web Speech API). The voice is always given kana, so it can't misread a kanji. Voice quality depends on the OS: macOS, iOS, Android and Windows have good Japanese voices. Google Translate's speech endpoint isn't usable from a web page (unofficial, against its terms, and blocked by CORS).

## Running it

Serve the folder over HTTP, for example:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000/. For use on other devices, host it on any static host over HTTPS so it can be installed as an app and work offline. GitHub Pages on a **private** repo needs a paid GitHub plan. Cloudflare Pages and Netlify both deploy private repos on their free tiers.

Progress stays in the browser you study in. Use **Settings → Export backup** to move it or keep a copy.

## Data

`data/curriculum.json` is built by `tools/build_data.py` from:

| Data | Source | License |
| --- | --- | --- |
| Kanji meanings, readings, grades, frequency | [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) (EDRDG), via [jmdict-simplified](https://github.com/scriptin/jmdict-simplified) | CC BY-SA 4.0 |
| Words, readings, glosses | [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) (EDRDG), via jmdict-simplified | CC BY-SA 4.0 |
| Kanji components | [KanjiVG](https://kanjivg.tagaini.net/) (Ulrich Apel and contributors) | CC BY-SA 3.0 |
| Furigana alignment | [JmdictFurigana](https://github.com/Doublevil/JmdictFurigana) | CC BY-SA 4.0 |
| JLPT levels | Jonathan Waller's lists ([tanos.co.uk](https://www.tanos.co.uk/jlpt/)), via [Bluskyo/JLPT_Vocabulary](https://github.com/Bluskyo/JLPT_Vocabulary) and [open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks) | CC BY / MIT |

The built file is shared under CC BY-SA 4.0. `.github/workflows/update-data.yml` rebuilds it monthly from the latest releases, as the EDRDG licence asks. Before committing, it checks the result with `tools/check_data.py` and the answer tests.

To rebuild by hand, download the files that the workflow downloads, then run:

```sh
python3 tools/build_data.py kanjidic2-en-*.json jmdict-eng-*.json kanjivg-*.xml \
  JmdictFurigana.json tanos/ jlpt-vocab/ data/curriculum.json
```

## Code

Plain ES modules with no build step:

| File | What it does |
| --- | --- |
| `js/data.js` | Loads and indexes the curriculum; defines the cards for each item |
| `js/answer.js` | Answer checking: fuzzy meanings, kana typos, wrong-kind answers |
| `js/state.js` | Cards, unlocking, the daily allowance, queues and stats |
| `js/srs.js` | ts-fsrs wrapper |
| `js/store.js` | IndexedDB, backup and restore |
| `js/quiz.js` | The typed quiz used by lessons and reviews (retry, undo, synonyms) |
| `js/speech.js` | Web Speech API text-to-speech |
| `js/views/*.js` | Today, lessons, reviews, browse, item pages, settings |
| `vendor/` | [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) and [WanaKana](https://github.com/WaniKani/WanaKana), both MIT |

Tests:

```sh
node tests/answer_test.mjs          # answer checking against the real data
python3 tests/e2e.py http://localhost:8000/   # a simulated first week in Chrome (Playwright)
```

## Ideas for later

- Handwriting practice for learned kanji, reusing Kakitori's stroke grading
- Example sentences (Tatoeba, CC BY)
- Higher-quality speech with your own cloud text-to-speech key, stored only on your device
- A frequency order based on anime and drama subtitles, once a suitably licensed list is found

Fonts: Klee One and Zen Kaku Gothic New, SIL Open Font License 1.1 (see `fonts/`).
