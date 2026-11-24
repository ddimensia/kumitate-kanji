"""Build data/curriculum.json: radicals, kanji and vocabulary in study order.

Usage:
  python3 tools/build_data.py KANJIDIC2.json JMDICT.json KANJIVG.xml FURIGANA.json \
      TANOS_KANJI_DIR JLPT_VOCAB_DIR OUT.json

Inputs (data only; read, never executed):
  KANJIDIC2.json   kanjidic2-en-*.json from a jmdict-simplified release
                   (github.com/scriptin/jmdict-simplified). EDRDG, CC BY-SA 4.0.
  JMDICT.json      jmdict-eng-*.json (full English file) from the same release. EDRDG, CC BY-SA 4.0.
  KANJIVG.xml      kanjivg-YYYYMMDD.xml from a KanjiVG release (github.com/KanjiVG/kanjivg).
                   Ulrich Apel and contributors, CC BY-SA 3.0. Used for each kanji's components.
  FURIGANA.json    JmdictFurigana.json (github.com/Doublevil/JmdictFurigana), CC BY-SA 4.0.
                   Lines up each kanji of a word with its part of the reading.
  TANOS_KANJI_DIR  n5_kanji.csv ... n1_kanji.csv (github.com/Bluskyo/JLPT_Vocabulary,
                   data/kanji/parsedData): Jonathan Waller's JLPT kanji lists, CC BY.
  JLPT_VOCAB_DIR   n1.csv ... n5.csv (github.com/jamsinclair/open-anki-jlpt-decks, src):
                   JLPT vocabulary lists (Waller), MIT.

How the curriculum is put together
  * Kanji: the JLPT lists, N5 first, by newspaper frequency within a level.
  * Components ("radicals"): KanjiVG splits each kanji into a tree of parts (働 = 亻 + 動,
    動 = 重 + 力). A kanji's prerequisites are its top-level parts. A part that is itself a
    kanji on the list at the same level, or one level up, is taught as a kanji first;
    any other part is taught as a radical (meaning only). Single strokes are ignored.
  * Readings: KANJIDIC gives every reading. A reading counts as common when it shows up in
    enough common or JLPT words (counted with JmdictFurigana, allowing for sound changes
    such as rendaku and small っ). Only common readings are quizzed.
  * Vocabulary: JLPT words whose kanji are all on the list, plus common JMdict words for
    kanji that would otherwise have fewer than three words.
"""
import csv, json, os, re, sys, unicodedata
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from radical_names import RADICAL_NAMES, RADICAL_NOTES, IGNORE_PARTS, MERGE  # noqa: E402


def is_kanji(c):
    return '一' <= c <= '鿿' or '㐀' <= c <= '䶿' or c == '々'


def hira(s):
    """Katakana to hiragana (leaves everything else alone)."""
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in s)


# ---- KANJIDIC2 ---------------------------------------------------------------
def load_kanjidic(path):
    data = json.load(open(path, encoding='utf-8'))
    out = {}
    for ch in data['characters']:
        misc = ch.get('misc') or {}
        rm = ch.get('readingMeaning') or {}
        on, kun, meanings = [], [], []
        for g in rm.get('groups') or []:
            for r in g.get('readings') or []:
                if r['type'] == 'ja_on':
                    on.append(r['value'])
                elif r['type'] == 'ja_kun':
                    kun.append(r['value'])
            meanings += [m['value'] for m in g.get('meanings') or [] if m.get('lang', 'en') == 'en']
        out[ch['literal']] = {
            'freq': misc.get('frequency'), 'grade': misc.get('grade'),
            'rad': next((r['value'] for r in ch.get('radicals') or [] if r['type'] == 'classical'), None),
            'strokes': (misc.get('strokeCounts') or [0])[0],
            'on': on, 'kun': kun, 'meanings': meanings,
        }
    return out, {k: data.get(k) for k in ('version', 'dictDate')}


# ---- KanjiVG components --------------------------------------------------------
G_OPEN = re.compile(r'<g\b([^>]*?)(/?)>|</g>|<path\b')
ATTR = re.compile(r'kvg:(\w+)="([^"]*)"')


def load_kanjivg(path):
    """{kanji: tree}. A tree node is {'el', 'orig', 'part', 'strokes', 'kids'}."""
    xml = open(path, encoding='utf-8').read()
    trees = {}
    for m in re.finditer(r'<kanji id="kvg:kanji_([0-9a-f]+)">(.*?)</kanji>', xml, re.S):
        if '-' in m.group(1):
            continue  # variant glyph files (…-Kaisho etc.)
        ch = chr(int(m.group(1), 16))
        root, stack = None, []
        for t in G_OPEN.finditer(m.group(2)):
            s = t.group(0)
            if s.startswith('<path'):
                for n in stack:
                    n['strokes'] += 1
            elif s.startswith('</g'):
                stack.pop()
            else:
                a = dict(ATTR.findall(t.group(1)))
                node = {'el': a.get('element'), 'orig': a.get('original'), 'part': a.get('part'),
                        'strokes': 0, 'kids': []}
                if stack:
                    stack[-1]['kids'].append(node)
                else:
                    root = node
                if not t.group(2):
                    stack.append(node)
        if root:
            trees[ch] = root
    return trees


def top_parts(tree, self_ch):
    """Top-level components of a kanji, in writing order, as (element, original, strokes)."""
    out, seen = [], {}

    def walk(n):
        for k in n['kids']:
            el = k['el']
            if el and el != self_ch:
                if el in seen:
                    seen[el][2] += k['strokes']  # split part (part="1", part="2")
                else:
                    seen[el] = [el, k['orig'], k['strokes']]
                    out.append(seen[el])
            else:
                walk(k)

    walk(tree)
    return [tuple(x) for x in out]


# ---- Radical names -----------------------------------------------------------
KANGXI = {}
CLASSICAL = {}  # the 214 classical (Kangxi) radicals: number -> (character, English name)
for cp in list(range(0x2F00, 0x2FD6)) + list(range(0x2E80, 0x2EF4)):
    try:
        name = unicodedata.name(chr(cp))
    except ValueError:
        continue
    base = unicodedata.normalize('NFKC', chr(cp))
    words = re.sub(r'^(KANGXI|CJK) RADICAL ', '', name).lower()
    KANGXI.setdefault(chr(cp), words)
    if base != chr(cp):
        KANGXI.setdefault(base, words)
    if cp < 0x2FD6:
        CLASSICAL[cp - 0x2F00 + 1] = (base, words)
CLASSICAL_CHARS = {c for c, _ in CLASSICAL.values()}
# Other forms of classical radicals: as written inside kanji, or in modern Japanese.
CLASSICAL_FORMS = {
    '辵': '⻌辶', '艸': '艹⺾', '阜': '⻖', '邑': '⻏', '攴': '攵', '网': '罒㓁', '襾': '覀', '爪': '⺤爫',
    '无': '旡', '臼': '𦥑', '戶': '戸', '靑': '青', '黑': '黒', '黃': '黄', '齒': '歯', '麥': '麦',
    '夊': '夂', '彐': '⺕彑', '尢': '尤', '水': '氵氺', '心': '忄⺗', '手': '扌', '人': '亻𠆢', '刀': '刂',
    '示': '礻', '衣': '衤', '犬': '⺨犭', '火': '灬', '玉': '王', '老': '耂', '食': '飠', '糸': '糹',
    '言': '訁', '金': '釒', '肉': '月', '川': '巛', '曰': '日', '囗': '口',
}


def kanji_meanings(K, c):
    """A kanji's meanings as the course shows them (dictionary notes and abbreviations dropped)."""
    return [m for m in K[c]['meanings'] if not m.startswith('(') and not re.fullmatch(r'[A-Z][a-z]*\.', m)]


UNHELPFUL = re.compile(r'surname|used as|interjection|name of|ancient|RHS|radical|sign of the|term of', re.I)


def plain(m):
    return re.sub(r'^(to|the|a|an) ', '', m)


def radical_name(el, orig, K, course):
    """(name, alternatives) for a component, or None when nothing sensible is known.

    A component that is also a kanji takes the kanji's name, so 口 is "mouth" both ways.
    The exceptions are components with a well-known radical name of their own: the 214
    classical radicals and the side/top forms (亻, 氵, 艹 ...), named in radical_names.py.
    """
    curated = RADICAL_NAMES.get(el, [])
    kanji = kanji_meanings(K, el) if el in K else []
    variant = bool(orig and orig != el) or not ('一' <= el <= '鿿')
    if curated and (el in CLASSICAL_CHARS or variant):
        extra = [m for m in kanji[:2] if m not in curated and not UNHELPFUL.search(m)]
        return curated[0], curated[1:] + extra
    if el in course and kanji:
        return kanji[0], [m for m in curated + kanji[1:4] if m != kanji[0] and not UNHELPFUL.search(m)]
    good = [plain(m) for m in kanji if len(m) <= 22 and not UNHELPFUL.search(m)]
    if good:
        return good[0], [m for m in curated + good[1:4] if m != good[0]]
    if curated:
        return curated[0], curated[1:]
    for c in (el, orig):
        if c and c in K and K[c]['meanings']:
            m = [x for x in K[c]['meanings'] if len(x) <= 24 and 'radical' not in x]
            if m:
                return m[0], m[1:4]
    for c in (el, orig):
        if c and c in KANGXI:
            return KANGXI[c], []
    return None


# ---- JMdict --------------------------------------------------------------------
BAD_FORM = {'iK', 'oK', 'rK', 'sK', 'ik', 'ok', 'rk', 'sk'}
POS = {
    'n': 'noun', 'pn': 'pronoun', 'adj-i': 'い-adjective', 'adj-na': 'な-adjective',
    'adj-no': 'の-adjective', 'adv': 'adverb', 'vs': 'する verb', 'vt': 'transitive',
    'vi': 'intransitive', 'v1': 'ichidan verb', 'exp': 'expression', 'ctr': 'counter',
    'suf': 'suffix', 'pref': 'prefix', 'num': 'numeric', 'int': 'interjection',
    'conj': 'conjunction', 'adj-t': 'たる-adjective', 'adj-pn': 'pre-noun adjectival',
    'n-suf': 'noun suffix', 'n-pref': 'noun prefix', 'aux-v': 'auxiliary verb',
}


def pos_label(tags):
    out = []
    for t in tags:
        if t.startswith('v5') or t == 'v4r':
            lab = 'godan verb'
        elif t.startswith('v1'):
            lab = 'ichidan verb'
        elif t in ('vs-i', 'vs-s', 'vs-c'):
            lab = 'する verb'
        elif t == 'vk':
            lab = 'くる verb'
        else:
            lab = POS.get(t)
        if lab and lab not in out:
            out.append(lab)
    return out[:3]


def clean_gloss(g):
    g = re.sub(r'\s*\([^)]*\)', '', g).strip()
    return g


def load_jlpt_vocab(vocab_dir):
    jlpt = {}
    for n in (1, 2, 3, 4, 5):
        with open(os.path.join(vocab_dir, f'n{n}.csv'), encoding='utf-8') as f:
            for row in csv.DictReader(f):
                for x in re.split(r'[;；、,]', row['expression']):
                    for r in re.split(r'[;；、,]', row['reading']):
                        x, r = (re.sub(r'[(（][^)）]*[)）]', '', t).strip(' 〜～') for t in (x, r))
                        if r.endswith('する') and not x.endswith('する'):
                            r = r[:-2]
                        jlpt[(x, r)] = max(jlpt.get((x, r), 0), n)
    return jlpt


def load_words(path, jlpt):
    """Candidate words written with kanji: common or on a JLPT list."""
    data = json.load(open(path, encoding='utf-8'))
    out = []
    for e in data['words']:
        if not e['kanji'] or not e['sense']:
            continue
        if 'uk' in e['sense'][0]['misc']:
            continue  # usually written in kana
        kanji = [k for k in e['kanji'] if not BAD_FORM & set(k['tags'])]
        kana = [k for k in e['kana'] if not BAD_FORM & set(k['tags'])]
        if not kanji or not kana:
            continue
        forms = {k['text'] for k in kanji}
        level = max((jlpt.get((x, k['text']), 0) for x in forms for k in kana), default=0)
        common = any(k['common'] for k in kanji)
        if not (common or level):
            continue
        # The written form: the JLPT list's spelling if it has one, else the first common one.
        word = next((k['text'] for k in kanji if any(jlpt.get((k['text'], r['text'])) for r in kana)), None)
        word = word or next((k['text'] for k in kanji if k['common']), kanji[0]['text'])
        fits = [k for k in kana if '*' in k['appliesToKanji'] or word in k['appliesToKanji']]
        if not fits:
            continue
        fits.sort(key=lambda k: (not jlpt.get((word, k['text'])), not k['common']))
        readings = [fits[0]['text']] + [k['text'] for k in fits[1:] if k['common']]
        senses = []
        for s in e['sense']:
            if not ('*' in s['appliesToKanji'] or word in s['appliesToKanji']):
                continue
            gl = [g['text'] for g in s['gloss'] if g.get('lang', 'eng') == 'eng']
            if gl:
                senses.append((gl, s['partOfSpeech'], s.get('misc') or []))
            if len(senses) == 5:
                break
        if not senses:
            continue
        out.append({
            'id': e['id'], 'w': word, 'r': readings, 'senses': senses,
            'jlpt': level, 'common': common,
        })
    return out, {k: data.get(k) for k in ('version', 'dictDate')}


# ---- Readings ----------------------------------------------------------------
VOICED = dict(zip('かきくけこさしすせそたちつてとはひふへほ', 'がぎぐげござじずぜぞだぢづでどばびぶべぼ'))
HANDAKU = dict(zip('はひふへほ', 'ぱぴぷぺぽ'))


def variants(r, allow_sokuon):
    """Spellings a reading takes inside words: rendaku voicing, small っ at the end."""
    out = {r}
    if r and r[0] in VOICED:
        out.add(VOICED[r[0]] + r[1:])
    if r and r[0] in HANDAKU:
        out.add(HANDAKU[r[0]] + r[1:])
    if allow_sokuon and len(r) >= 2 and r[-1] in 'つくちき':
        out |= {v[:-1] + 'っ' for v in list(out)}
    if r.endswith('ぢ') or r.endswith('づ'):
        pass
    return out


def kun_stem(k):
    return k.strip('-').split('.')[0]


def kun_okuri(k):
    k = k.strip('-')
    return k.split('.', 1)[1] if '.' in k else ''


I_ROW = dict(zip('うくぐすつぬぶむる', 'いきぎしちにびみり'))


def rank_kun_forms(forms, use):
    """Usage per form with a verb's noun and prefix forms (のぼ.り, た.ち-) credited to the verb.
    Returns (use, derived forms)."""
    total = Counter({f: use[f] for f in forms})
    derived = set()
    verbs = [f for f in forms if not f.startswith('-') and not f.endswith('-') and kun_okuri(f)[-1:] in I_ROW]
    for f in forms:
        o = kun_okuri(f).rstrip('-')
        for v in verbs:
            ov = kun_okuri(v)
            if v != f and o and (o == ov[:-1] + I_ROW[ov[-1]] or (ov.endswith('る') and o == ov[:-1])):
                total[v] += use[f]
                derived.add(f)
                break
    return total, derived


def count_forms(use, kun, stem, after, weight):
    """Credit the kun'yomi form a word uses: 生きる -> い.きる, 生き物 -> い.きる (half), 生 -> なま."""
    rest = ''
    for seg in after:  # the kana right after the kanji
        if any(is_kanji(ch) for ch in seg[0]):
            break
        rest += hira(seg[0])
    forms = [k for k in kun if kun_stem(k) == stem]
    full = [k for k in forms if kun_okuri(k) and rest.startswith(hira(kun_okuri(k)))]
    if full:
        longest = max(len(kun_okuri(k)) for k in full)
        for k in full:
            if len(kun_okuri(k)) == longest:
                use[k] += 2 * weight
        return
    # A verb's stem inside a compound (生き物, 値上げ) counts half for each form it could be.
    part = [k for k in forms if len(kun_okuri(k)) >= 2 and rest.startswith(hira(kun_okuri(k))[:-1])]
    for k in part:
        use[k] += weight
    if not part:
        for k in forms:
            if not kun_okuri(k):
                use[k] += weight


# ---- main ----------------------------------------------------------------------
def main(argv):
    kanjidic_path, jmdict_path, kvg_path, furi_path, tanos_dir, vocab_dir, out_path = argv[1:8]
    K, kanjidic_version = load_kanjidic(kanjidic_path)
    trees = load_kanjivg(kvg_path)

    jlpt_level = {}
    for n in (5, 4, 3, 2, 1):
        with open(os.path.join(tanos_dir, f'n{n}_kanji.csv'), encoding='utf-8') as f:
            for row in csv.DictReader(f):
                c = row['Kanji'].strip()
                if c and c not in jlpt_level and c in K:
                    jlpt_level[c] = n
    INF = 10 ** 6
    freq = lambda c: K[c]['freq'] or INF
    kanji_list = sorted(jlpt_level, key=lambda c: (-jlpt_level[c], freq(c), K[c]['strokes'], c))

    # -- Order kanji and components -------------------------------------------
    order, placed = [], set()
    radicals, kanji_parts, radical_users = {}, {}, defaultdict(list)
    unnamed = Counter()

    def usable_parts(c):
        """A kanji's top-level parts worth teaching (single strokes and junk dropped)."""
        tree = trees.get(c)
        out = []
        for el, orig, strokes in (top_parts(tree, c) if tree else []):
            el = MERGE.get(el, el)
            if el == c or el in IGNORE_PARTS or strokes <= 1 and el != '一':
                continue
            if el not in [x[0] for x in out]:
                out.append((el, orig, strokes))
        return out

    def is_basic(c):
        """A kanji not built from smaller taught parts: it serves as its own radical."""
        return not usable_parts(c)

    def place_kanji(c, level, chain=()):
        if 'k:' + c in placed or c in chain:
            return
        prereqs = []
        for el, orig, strokes in usable_parts(c):
            pid = part_id(el, orig, strokes, level, chain + (c,))
            if pid and pid not in prereqs:
                prereqs.append(pid)
        if not prereqs:
            # Every kanji has a radical: a basic kanji (口, 日, 山) is taught first as a
            # radical of the same shape, then as a kanji with its readings.
            pid = place_radical(c, None, K[c]['strokes'])
            if pid:
                prereqs.append(pid)
        kanji_parts[c] = prereqs
        for p in prereqs:
            if p.startswith('r:'):
                radical_users[p[2:]].append(c)
        placed.add('k:' + c)
        order.append('k:' + c)

    def part_id(el, orig, strokes, level, chain):
        # A basic kanji used as a part counts as its radical (明 = 日 + 月 radicals);
        # a kanji built from parts of its own stays a kanji part (働 = 亻 + 動).
        if el in jlpt_level and is_basic(el):
            return place_radical(el, orig, strokes)
        if 'k:' + el in placed:
            return 'k:' + el
        if el in jlpt_level and jlpt_level[el] >= level - 1 and el not in chain:
            place_kanji(el, jlpt_level[el], chain)
            return 'k:' + el
        return place_radical(el, orig, strokes)

    def place_radical(el, orig, strokes):
        if 'r:' + el in placed:
            return 'r:' + el
        named = radical_name(el, orig, K, jlpt_level)
        if not named:
            unnamed[el] += 1
            return None
        name, alt = named
        radicals[el] = {'n': name, 'a': alt, 's': strokes}
        if orig and orig != el:
            radicals[el]['o'] = orig
        placed.add('r:' + el)
        order.append('r:' + el)
        return 'r:' + el

    for c in kanji_list:
        place_kanji(c, jlpt_level[c])

    # -- Vocabulary ------------------------------------------------------------
    jlpt_words = load_jlpt_vocab(vocab_dir)
    words, jmdict_version = load_words(jmdict_path, jlpt_words)
    kset = set(jlpt_level)
    words = [w for w in words if all((not is_kanji(c)) or c in kset for c in w['w'])
             and all(is_kanji(c) or '぀' <= c <= 'ヿ' for c in w['w'])]

    furi = {}
    for f in json.load(open(furi_path, encoding='utf-8-sig')):
        furi[(f['text'], f['reading'])] = [[x['ruby'], x.get('rt', '')] for x in f['furigana']]

    # Reading counts over every candidate word.
    counts = defaultdict(Counter)  # kanji -> Counter({('on', reading): n})
    alone = defaultdict(set)       # readings used by a word written with just that kanji (明るい)
    easiest = defaultdict(dict)    # kanji -> {reading: easiest JLPT level (5 = N5) of a word using it}
    juku = defaultdict(list)       # kanji -> word ids with a special reading
    form_use = defaultdict(Counter)  # kanji -> Counter({kun form: use}), to rank 生きる over 生ける
    on_var, kun_var = {}, {}
    for c in kset:
        on_var[c] = {r: variants(hira(r), True) for r in K[c]['on']}
        kun_var[c] = {k: variants(kun_stem(k), False) for k in K[c]['kun']}
    for w in words:
        segs = furi.get((w['w'], w['r'][0]))
        w['f'] = segs
        if not segs:
            continue
        weight = 2 if w['jlpt'] else 1
        for si, seg in enumerate(segs):
            ruby, rt = seg[0], seg[1]
            ks = [c for c in ruby if is_kanji(c) and c != '々']
            if len(ks) == 1 and len(ruby) == 1 and ruby in kset:
                c = ruby
                hit = next((('on', r) for r, vs in on_var[c].items() if rt in vs), None)
                hit = hit or next((('kun', k) for k, vs in kun_var[c].items() if rt in vs), None)
                if hit:
                    seg.append('o' if hit[0] == 'on' else 'k')
                    counts[c][hit] += weight
                    if w['jlpt']:
                        easiest[c][hit] = max(easiest[c].get(hit, 0), w['jlpt'])
                    if [x for x in w['w'] if is_kanji(x)] == [c]:
                        alone[c].add(hit)
                    if hit[0] == 'kun':
                        count_forms(form_use[c], K[c]['kun'], kun_stem(hit[1]), segs[si + 1:], weight)
            elif len(ks) >= 2 or (len(ks) == 1 and len(ruby) > 1 and '々' not in ruby):
                seg.append('j')
                for c in set(ks):
                    juku[c].append(w['id'])

    readings = {}
    for c in kset:
        cnt = counts[c]
        total = sum(cnt.values())
        res = {}
        for kind, src in (('on', K[c]['on']), ('kun', K[c]['kun'])):
            # Entries are [forms, count, common]. Kun'yomi sharing a stem are grouped
            # (あ.げる, あ.がる), since a word's furigana only shows the stem.
            groups, solo, level_of = {}, set(), {}
            for r in src:
                key = r if kind == 'on' else kun_stem(r)
                n = cnt.get((kind, r), 0)
                lv = easiest[c].get((kind, r), 0)
                if key in groups:
                    if r not in groups[key][0]:
                        groups[key][0].append(r)
                    groups[key][1] += n
                    level_of[key] = max(level_of[key], lv)
                else:
                    groups[key] = [[r], n]
                    level_of[key] = lv
                if (kind, r) in alone[c]:
                    solo.add(key)
            lst = list(groups.values())
            type_total = sum(n for _, n in lst)
            top = max((n for _, n in lst), default=0)
            for x in lst:
                x.append(1 if x[1] >= 2 and (x[1] >= 0.12 * type_total and x[1] >= 0.04 * total
                                              or x[1] == top and x[1] >= 0.04 * total) else 0)
            # A reading used by a word made of this kanji alone (上 うえ, 明るい) is common too.
            for key, x in groups.items():
                if key in solo:
                    x[2] = 2
            # Keep at most three common readings of a kind (plus stand-alone words), by usage.
            common = sorted([x for x in lst if x[2] == 1], key=lambda x: -x[1])
            for x in common[3:]:
                x[2] = 0
            for x in lst:
                x[2] = min(x[2], 1)
            # Fourth field: the easiest JLPT level of a word using the reading (0: none), so the
            # app can teach only readings you'll meet in words soon (田: た yes, デン later).
            for key, x in groups.items():
                x.append(level_of[key])
            if kind == 'kun':
                # Most used form first (生: い.きる before い.かす, い.ける); nouns and prefixes made
                # from a verb (のぼ.り, た.ち-) count toward the verb and go after it, and suffix-only
                # forms (-う) go last. Fifth field: how many forms are worth showing, 1 or 2 (a
                # second only if it's used at least half as often as the first).
                for x in lst:
                    use, derived = rank_kun_forms(x[0], form_use[c])
                    first_seen = {f: i for i, f in enumerate(x[0])}
                    x[0].sort(key=lambda f: (f.startswith('-'), f in derived or f.endswith('-'), -use[f], first_seen[f]))
                    shown = [f for f in x[0] if not f.startswith('-')]
                    top_use = use[shown[0]] if shown else 0
                    x.append(1 + (len(shown) > 1 and shown[1] not in derived and not shown[1].endswith('-')
                                  and top_use > 0 and use[shown[1]] * 2 >= top_use))
            res[kind] = lst
        if not any(x[2] for k in res.values() for x in k):
            # Rare kanji with no counted words: its first on'yomi (or kun'yomi) counts.
            for kind in ('on', 'kun'):
                cand = [x for x in res[kind] if not x[0][0].startswith('-') and not x[0][0].endswith('-')]
                if cand:
                    cand[0][2] = 1
                    break
        readings[c] = res

    # Pick vocabulary.
    by_kanji = defaultdict(list)
    for w in words:
        for c in set(w['w']):
            if c in kset:
                by_kanji[c].append(w)
    chosen = {}
    for w in words:
        if w['jlpt']:
            chosen[w['id']] = w
    pos = {c: i for i, c in enumerate(kanji_list)}
    for c in kanji_list:
        have = [w for w in by_kanji[c] if w['id'] in chosen]
        if len(have) >= 3:
            continue
        extra = [w for w in by_kanji[c] if w['id'] not in chosen and w['common'] and w.get('f')]
        # Prefer short words whose other kanji come early in the course.
        extra.sort(key=lambda w: (len(w['w']), max(pos.get(x, 0) for x in w['w'] if x in kset), w['id']))
        for w in extra[:3 - len(have)]:
            chosen[w['id']] = w

    # One word per spelling (JMdict has 日 read ひ, にち and か as separate entries). The best
    # one is kept; the others' readings are kept as "another word written the same way".
    same_form = defaultdict(list)
    for w in chosen.values():
        same_form[w['w']].append(w)
    for form, ws in same_form.items():
        if len(ws) < 2:
            continue
        affix = lambda w: bool({'suf', 'ctr', 'pref', 'n-suf', 'n-pref'} & set(w['senses'][0][1])
                                or 'abbr' in w['senses'][0][2])
        ws.sort(key=lambda w: (affix(w), -(w['jlpt'] or 0), not w['common'], int(w['id'])))
        keep = ws[0]
        keep['alt'] = [r for w in ws[1:] for r in w['r'] if r not in keep['r']]
        for w in ws[1:]:
            del chosen[w['id']]

    # Vocab follows the last of its kanji; JLPT words first, easier levels first.
    vocab_after = defaultdict(list)
    korder = {c: i for i, c in enumerate(x[2:] for x in order if x.startswith('k:'))}
    for w in chosen.values():
        ks = [c for c in w['w'] if c in kset]
        last = max(ks, key=lambda c: korder[c])
        vocab_after[last].append(w)
    full_order = []
    for item in order:
        full_order.append(item)
        if item.startswith('k:'):
            vs = vocab_after.get(item[2:], [])
            vs.sort(key=lambda w: (-(w['jlpt'] or 0), not w['common'], len(w['w']), w['id']))
            full_order += ['v:' + w['id'] for w in vs]

    # -- Output ----------------------------------------------------------------
    # Where a dictionary radical is taught: the radical itself, the form used inside kanji
    # (艸 -> 艹, 阜 -> ⻖), its modern form (靑 -> 青), or the kanji of the same character.
    by_orig = defaultdict(list)
    for r, info in radicals.items():
        if info.get('o'):
            by_orig[info['o']].append(r)

    def classical_item(ch):
        for c in [ch] + list(CLASSICAL_FORMS.get(ch, '')):
            if c in radicals:
                return 'r:' + c
            if c in kset:
                return 'k:' + c
            for r in by_orig.get(c, []):
                return 'r:' + r
        return None

    # A radical's level is that of the first kanji that uses it.
    first_level = {}
    for item_id in order:
        if item_id.startswith('k:'):
            for p in kanji_parts.get(item_id[2:], []):
                if p.startswith('r:'):
                    first_level.setdefault(p[2:], jlpt_level[item_id[2:]])
    for r, info in radicals.items():
        if r in first_level:
            info['j'] = first_level[r]

    kanji_out = {}
    for c in kanji_list:
        k = K[c]
        e = {
            'm': kanji_meanings(K, c)[:8],
            'on': readings[c]['on'], 'kun': readings[c]['kun'],
            'j': jlpt_level[c], 's': k['strokes'], 'p': kanji_parts.get(c, []),
        }
        if k['grade']:
            e['g'] = k['grade']
        if k['rad'] in CLASSICAL:
            e['kr'] = k['rad']
            target = classical_item(CLASSICAL[k['rad']][0])
            if target:
                e['krid'] = target
        if k['freq']:
            e['f'] = k['freq']
        jk = sorted({i for i in juku.get(c, []) if i in chosen},
                    key=lambda i: (-(chosen[i]['jlpt'] or 0), not chosen[i]['common'], i))
        if jk:
            e['jk'] = jk[:6]
        kanji_out[c] = e
    vocab_out = {}
    for w in chosen.values():
        senses = [[clean_gloss(g) for g in gl if clean_gloss(g)] for gl, *_ in w['senses']]
        senses = [s for s in senses if s]
        e = {'w': w['w'], 'r': w['r'], 'g': senses, 'p': pos_label(w['senses'][0][1])}
        if w.get('f'):
            e['f'] = w['f']
        if w['jlpt']:
            e['j'] = w['jlpt']
        if w['common']:
            e['c'] = 1
        if w.get('alt'):
            e['ar'] = w['alt']
        vocab_out[w['id']] = e
    for r, info in radicals.items():
        info['u'] = radical_users[r][:8]
        if r in RADICAL_NOTES:
            info['note'] = RADICAL_NOTES[r]

    out = {
        'about': 'Radicals, kanji and vocabulary for Kumitate Kanji. Kanji meanings, readings, grades and '
                 'frequency: KANJIDIC2; words: JMdict (both EDRDG, CC BY-SA 4.0, '
                 'https://www.edrdg.org/edrdg/licence.html). Components: KanjiVG (Ulrich Apel, CC BY-SA 3.0). '
                 'Furigana: JmdictFurigana (Doublevil, CC BY-SA 4.0). JLPT levels: Jonathan Waller, '
                 'tanos.co.uk, CC BY. This file is shared under CC BY-SA 4.0.',
        'sources': {'kanjidic2': kanjidic_version, 'jmdict': jmdict_version,
                    'kanjivg': os.path.basename(kvg_path)},
        'classical': {n: CLASSICAL[n] for n in sorted({k['kr'] for k in kanji_out.values() if 'kr' in k})},
        'radicals': radicals, 'kanji': kanji_out, 'vocab': vocab_out, 'order': full_order,
    }
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    n = Counter(x[0] for x in full_order)
    print(f"radicals {n['r']}, kanji {n['k']}, vocab {n['v']}; {os.path.getsize(out_path)//1024} KB",
          file=sys.stderr)
    if unnamed:
        print('components without a name (skipped):', ' '.join(f'{c}×{n}' for c, n in unnamed.most_common()),
              file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv)
