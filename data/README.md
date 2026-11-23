# Course data

`curriculum.json` is everything Kumitate Kanji teaches: 469 radicals, 2,211 kanji and 7,327 words, in study order. It's built by `tools/build_data.py` from open dictionary data and rebuilt monthly by `.github/workflows/update-data.yml`. Don't edit it by hand; change the build script or `tools/radical_names.py` and rebuild.

## Licence

`curriculum.json` is shared under the [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/) licence, as its sources require. If you reuse it, credit the sources below and share what you make from it under the same licence. The app's code is separately MIT licensed (see `LICENSE`).

| Data | Source | Licence |
| --- | --- | --- |
| Kanji meanings, readings, school grades, frequency, classical radicals | [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project), © Electronic Dictionary Research and Development Group, via [jmdict-simplified](https://github.com/scriptin/jmdict-simplified) | [CC BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html) |
| Words, readings and meanings | [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html), © Electronic Dictionary Research and Development Group, via jmdict-simplified | [CC BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html) |
| How kanji break into parts | [KanjiVG](https://kanjivg.tagaini.net/), © Ulrich Apel and contributors | CC BY-SA 3.0 (`KanjiVG-COPYING.txt`); adaptations may use later versions of the licence, so it's included here under 4.0 |
| Which kana of a word's reading go with which kanji | [JmdictFurigana](https://github.com/Doublevil/JmdictFurigana) | CC BY-SA 4.0 |
| JLPT levels of kanji and words | Jonathan Waller's lists, [tanos.co.uk](https://www.tanos.co.uk/jlpt/), via [Bluskyo/JLPT_Vocabulary](https://github.com/Bluskyo/JLPT_Vocabulary) and [open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks) | CC BY (lists); MIT (repos) |
| English names of radicals | Written for this project in `tools/radical_names.py`, otherwise from KANJIDIC2 or Unicode radical names | as above |

The JLPT publishes no official lists; Waller's lists are the usual stand-in.

## Format

One JSON object. Short keys keep the file small.

```text
about       text      credits and licence, as above
sources     object    versions of the dictionaries used: kanjidic2, jmdict, kanjivg
classical   object    "number": [character, English name] for each classical (Kangxi) radical used
radicals    object    character: radical
kanji       object    character: kanji
vocab       object    JMdict entry id: word
order       array     study order, as ids: "r:亻", "k:日", "v:1234567"
```

**Radical** (`radicals["亻"]`)

| Key | Meaning |
| --- | --- |
| `n` | name taught |
| `a` | other accepted names |
| `s` | stroke count |
| `o` | the full form it's a variant of (亻 → 人), if any |
| `j` | JLPT level of the first kanji that uses it (5 = N5) |
| `u` | up to eight kanji that use it |
| `note` | a note shown on its card, if any |

**Kanji** (`kanji["日"]`)

| Key | Meaning |
| --- | --- |
| `m` | English meanings, main one first |
| `on`, `kun` | readings: `[forms, count, common, level]`. `forms` holds KANJIDIC spellings (kun'yomi grouped by stem, e.g. `["あ.げる", "あ.がる"]`). `count` is how many common or JLPT words use the reading (JLPT words count twice). `common` is 1 if the reading counts as common. `level` is the easiest JLPT level of a word using it (5 = N5, 0 = none). |
| `j` | JLPT level (5 = N5) |
| `g` | school grade (1–6, 8 = secondary), if any |
| `f` | newspaper frequency rank, if any |
| `s` | stroke count |
| `p` | what it's built from, as ids (`"r:亻"`, `"k:動"`), in writing order |
| `kr`, `krid` | its classical radical number, and the id of the item that teaches that radical |
| `jk` | ids of words with special readings (jukujikun, e.g. 今日 きょう) |

**Word** (`vocab["1234567"]`)

| Key | Meaning |
| --- | --- |
| `w` | the word as written |
| `r` | accepted readings, main one first |
| `ar` | readings of other JMdict entries spelled the same way (日: か, にち) |
| `g` | meanings, one list of glosses per sense |
| `p` | part of speech labels |
| `f` | furigana: `[text, reading, kind]` per segment, where kind is `o` (on'yomi), `k` (kun'yomi), `j` (special reading) or absent (kana) |
| `j` | JLPT level, if on a list |
| `c` | 1 if JMdict marks it as common |

## How it's put together

See the comment at the top of `tools/build_data.py`. In short:

- **Kanji:** the JLPT lists, N5 first, then by frequency.
- **Parts:** each kanji's parts come from KanjiVG. A basic kanji is taught as its own radical first.
- **Readings:** a reading counts as common if it appears in enough common or JLPT words.
- **Words:** JLPT words whose kanji are all in the course, plus a few common words for kanji that would otherwise have fewer than three.
