# Kumitate Kanji 組み立て漢字

Learn kanji radicals, kanji with their on'yomi and kun'yomi, and the vocabulary that uses them, with typed answers and spaced repetition. 組み立て (kumitate) means "assembly": radicals build kanji, and kanji build words. It's the reading companion to [Kakitori](https://ddimensia.github.io/kakitori/) (書き取り, writing; [source](https://github.com/ddimensia/kakitori)).

The app was first called Yomitori. Its browser storage keeps that name, so progress saved under the old name carries over, and old backups still import.

Everything runs in the browser. There is no server and no account: progress is stored in IndexedDB, and the host only serves static files.

## How it works

**Order.** Kanji follow the JLPT lists, N5 first, by newspaper frequency within each level (2,211 kanji). Before each kanji come the components it's built from, and after it come the words written with it (about 7,300).

**Radicals.** Every kanji has radicals, as on KanjiDamage. Components come from KanjiVG's stroke groups, so they nest: 働 = 亻 + 動, and 動 = 重 + 力.
- A basic kanji that isn't built from smaller parts (口, 日, 山) is first taught as a radical of the same shape, then as a kanji with its readings.
- When a basic kanji is a part of another kanji, the larger one is built from its radical: 明 = 日 + 月 radicals.
- A part that is a kanji built from parts of its own stays a kanji part (動 in 働). It is taught first if it's at the same JLPT level or one level up; otherwise it's taught as a radical.
- Like KanjiDamage, the enclosure 囗 counts as the 口 (mouth) radical.
- A radical that is also a kanji takes the kanji's name, except where a radical has a well-known name of its own: the 214 classical radicals and the side and top forms (亻 "person", 氵 "water", 艹 "grass"). Those names are in `tools/radical_names.py`. Single strokes are skipped.
- Kanji cards show the breakdown one level deep, plus the dictionary radical (部首).

**Questions.** Each item has its own cards, each with its own FSRS schedule:

| Item | Cards |
| --- | --- |
| Radical | meaning |
| Kanji | meaning, on'yomi (if it has a common one), kun'yomi (if it has a common one) |
| Word | meaning, reading |

Only readings you'll actually need soon are asked for.
- **Common:** a reading counts as common when it appears in enough common or JLPT words (counted from JmdictFurigana, allowing for rendaku and small っ), or when the kanji on its own is a word read that way (上 うえ, 明るい).
- **Taught:** a common reading is taught and quizzed with the kanji only if a JLPT word using it is at most two levels harder than the kanji. 田 (N4) teaches た (田, N3) but not デン, which is only used in N1 words (水田, 田園); you learn デン through those words. At most two kun'yomi are taught, the most used: 生 teaches い(きる) and う(まれる), while は(える) and なま come with their words. Every kanji teaches at least its most used reading.
- **Setting:** under Settings → Kanji readings to learn, choose one level ahead, two levels ahead or all common readings. Switching adds reading questions for kanji you've learned, or pauses them while keeping their history.
- **Forms:** a kun'yomi with many okurigana forms shows only its most used one or two, picked by counting the dictionary's words (生 い(きる), not い(かす)・い(ける)); the others are listed on hover. Nouns and prefixes made from a verb count toward the verb (上り坂 counts for のぼ(る)).
- **Words:** after a word's reading question, the answer shows which reading each kanji uses, with sound changes traced back: 学校 is 学 がっ, on'yomi (from がく) + 校 こう, on'yomi; 切手 is 切 きっ, kun'yomi (from き(る)) + 手 て, kun'yomi. Words read as a whole (大人 おとな) are marked as special readings.
- **Cards:** info cards show all readings, with taught ones highlighted, readings met later in words plain, and rare ones grey, plus special readings (jukujikun such as 今日 きょう). Any real reading is accepted as an answer.

**Answers.** Meanings are typed in English and readings in kana. Romaji turns into kana as you type, via WanaKana. When an answer isn't graded right, one of four things happens:

- **Close spelling** of a meaning is accepted. Swapped letters count as one slip ("wrok" for "work").
- **Typo in a reading** (one kana off, as in ひるい for ひろい) isn't graded. The card shakes and you try again. Long vowels, small kana and dakuten are real distinctions, so こ for こう or か for が still counts as wrong.
- **Wrong kind of answer** isn't graded either: a kun'yomi when the on'yomi was asked, the kanji's reading for a word read differently (市 answered し is explained as 市's on'yomi, used in words like 市民, without giving away the answer), or a reading typed into a meaning question.
- **Giving up:** pressing Enter again on the same sent-back answer (or a blank one) marks it wrong.
- **Undo** (Backspace) reverts a wrong answer so you can fix it, as on Bunpro. You can also accept your wording as one of your own meanings.

**Cooling off.** New items come up for their first review 4 hours after the lesson, and a missed card comes back after 1 hour. You can change both in Settings.

**Unlocking.** An item unlocks the kanji and words built on it once every one of its cards has reached 3 days of FSRS stability. In practice that means after the lesson, the 4-hour review and the review two days later.

**Already know it?** Any item can go straight into reviews at a level you choose (learning, fresh, settling, solid or mastered), skipping its lesson. Do it from the item's page, or press **Select…** in Browse to pick many tiles at once (e.g. "Select all shown" on a level). The radicals and kanji an item is built from can be included. Each card gets matching FSRS stability. Its first review is spread over that interval, so marking hundreds of items doesn't make them all due on one day, and marked items don't count toward the day's new items. "Not studied" sends items back to lessons.

**Import from WaniKani.** In Settings, paste a read-only WaniKani API token and press **Check my WaniKani progress**. You'll see what would be imported, then **Import**.
- **Matching:** every radical, kanji and word you've started on WaniKani is matched to the same character or word here.
- **Schedule:** each item gets memory stability equal to its WaniKani stage's interval (Guru I = 7 days, Master = 30, Burned = a year), and its next review lands when WaniKani's does.
- **Radicals:** WaniKani's radicals mostly differ from these, so by default the radicals and kanji an imported item is built from come along at its stage.
- **Already studied:** items you've studied here are skipped unless you untick that option.
- **No match:** image-only radicals, kanji outside the JLPT lists, and words not in this course are listed and skipped.
- **Privacy:** the token stays in your browser (only if you ask), is never in backups, and nothing is sent to WaniKani beyond reading your progress.

**Your own meanings.** Add extra accepted meanings on a lesson card, after answering in a quiz ("Add a meaning"), or on an item's page.

**Extra study.** Today lists what you missed in your latest stretch of study: the 24 hours up to your most recent lesson or review, so a day off doesn't empty it. This covers lesson-quiz slips as well as reviews. **Extra study** quizzes you on those cards without changing their review schedule.

**Pace.** Lessons come in batches (5 by default) up to a daily maximum (15 by default). With adaptive pacing on, the daily number shrinks when your 7-day accuracy falls below 90% (to zero at 70%) or when more than 150 reviews are waiting. **Learn more anyway** on the Today page always allows another batch.

**Recall.** Today shows your weakest and most recently learned items, each with the current chance you'd recall it. Browse colours every radical, kanji and word by stage, from learning to mastered.

**Audio.** Words and readings are spoken with the browser's Japanese voice (Web Speech API). With **Read kanji and words aloud** on (Settings), a kanji's taught on'yomi and kun'yomi (without okurigana: 生きる is said as い), or a word's reading, are said when its lesson card opens and after you answer a reading question. Tapping any reading always plays it. The voice is always given kana, so it can't misread a kanji. Voice quality depends on the OS: macOS, iOS, Android and Windows have good Japanese voices. Google Translate's speech endpoint isn't usable from a web page (unofficial, against its terms, and blocked by CORS).

## Running it

Serve the folder over HTTP, for example:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000/. For use on other devices, host it on any static host over HTTPS so it can be installed as an app and work offline.

On GitHub, set Settings → Pages → Source to **GitHub Actions**. The Deploy workflow (`.github/workflows/deploy.yml`) then publishes on every push to `main`, and after each monthly data update, once the tests pass. It publishes only the app's own files, and adds the commit id to the offline cache version in `sw.js` so installed copies update. If you host the folder some other way, bump `VERSION` in `sw.js` by hand after changing app files.

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

The built file is shared under CC BY-SA 4.0. `data/README.md` describes its format and sources, and `data/KanjiVG-COPYING.txt` has KanjiVG's licence. `.github/workflows/update-data.yml` rebuilds it monthly from the latest releases, as the EDRDG licence asks. Before committing, it checks the result with `tools/check_data.py` and the answer tests.

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
| `js/wanikani.js` | WaniKani API v2 import: fetch, match, plan |
| `js/share.js` | Publishes a summary of your kanji progress for Kakitori (see below) |
| `js/views/*.js` | Welcome page, Today, lessons, reviews, Extra study, browse, item pages, settings |
| `vendor/` | [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) and [WanaKana](https://github.com/WaniKani/WanaKana), both MIT |

Tests:

```sh
node tests/answer_test.mjs          # answer checking against the real data
python3 tests/e2e.py http://localhost:8000/   # a simulated first week in Chrome (Playwright)
python3 tests/wanikani_test.py http://localhost:8000/   # WaniKani import against a fake API
```

## Sharing progress with Kakitori

[Kakitori](https://ddimensia.github.io/kakitori/), the writing app, can follow the kanji you learn here: in its Settings, choose "Kanji you've started in Kumitate Kanji". Both apps are served from `ddimensia.github.io`, so they share the browser's storage. It only works between the hosted apps in the same browser.

Kumitate Kanji keeps a small summary in its own database, `kumitate-share`, and rewrites it a moment after your progress changes. Other apps read that, never the study database (`yomitori`). Format 1, under the key `progress` in the `summary` store:

```js
{ format: 1, app: 'kumitate-kanji', updatedAt: 1795473653489,
  kanji: [{ ch: '一', order: 5, jlpt: 5, introducedAt: 1795473653489, passedAt: null, stage: 'learning' }, ...] }
```

`kanji` lists every kanji you've started, in curriculum order. `passedAt` is when the kanji unlocked the words built on it. `stage` is one of `learning`, `fresh`, `settling`, `solid` or `mastered`. A reader should open the database without a version number and abort the upgrade if one starts, so that it never creates the database. Kumitate Kanji also repairs either database if it finds one that exists but is empty.

## Ideas for later

- Handwriting practice for learned kanji, reusing Kakitori's stroke grading
- Example sentences (Tatoeba, CC BY)
- Higher-quality speech with your own cloud text-to-speech key, stored only on your device
- A frequency order based on anime and drama subtitles, once a suitably licensed list is found

Fonts: Klee One and Zen Kaku Gothic New, SIL Open Font License 1.1 (see `fonts/`).
