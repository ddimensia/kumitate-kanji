"""Usage: serve the app, then: python3 tests/split_test.py http://localhost:8000/
New kanji are taught step by step: the meaning alone first (nothing read aloud), then each kind
of reading in its own lesson (only that kind shown and read aloud), each step once the last has
passed its first review. A kanji that's also a learned radical with the same meaning starts with
its meaning and first reading."""
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000/'


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print('ok -', msg)


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context()
    ctx.add_init_script("""
      window.__said = [];
      if (window.speechSynthesis) window.speechSynthesis.speak = (u) => window.__said.push(u.text);
    """)
    pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(BASE + '#browse')
    pg.wait_for_selector('.browse, .page', state='attached')
    ROOT = "document.querySelector('#view') || document.querySelector('main')"

    def lesson(entry_js):
        """Show a lesson for the entry; return what's said and shown on its card."""
        pg.evaluate("window.__said = []")
        pg.evaluate(f"""async () => {{
          const {{ runLessons }} = await import('./js/views/lessons.js');
          const st = await import('./js/state.js');
          const {{ item }} = await import('./js/data.js');
          runLessons({ROOT}, [{entry_js}], {{ setKeys() {{}}, onExit() {{}}, again() {{}} }});
        }}""")
        pg.wait_for_selector('.lesson-card .info')
        pg.wait_for_timeout(300)
        return {
            'said': pg.evaluate('window.__said'),
            'note': pg.inner_text('.lesson-focus-note') if pg.locator('.lesson-focus-note').count() else '',
            'dts': [t for t in pg.locator('.lesson-card dl.readings dt').all_inner_texts() if t.startswith(('On', 'Kun'))],
            'step': pg.inner_text('.lesson-step'),
        }

    STEP = """async ([id, hoursLater]) => {
      // Take the kanji's next lesson, then pass its first review hoursLater.
      const st = await import('./js/state.js');
      const { item } = await import('./js/data.js');
      const entry = st.lessonQueue(5000).find((x) => x.id === id) || item(id);
      const t = new Date(window.__t);
      await st.introduceItems([entry], t);
      const queued = st.lessonQueue(5000).some((x) => x.id === id);
      for (const c of st.itemCards(item(id))) if (c.srs.state !== 2) await st.recordAnswer(c.id, true, new Date(t.getTime() + hoursLater * 3600e3));
      window.__t = t.getTime() + (hoursLater + 1) * 3600e3;
      const next = st.lessonQueue(5000).find((x) => x.id === id);
      return { types: entry.lessonTypes || st.lessonTypes(entry), queuedBefore: queued, next: next ? next.lessonReading : null,
               cards: ['m', 'on', 'kun'].filter((t) => st.getCard(id + '/' + t)), pending: st.pendingReadingsFor(id) };
    }"""

    info = pg.evaluate("""async () => {
      const sp = await import('./js/speech.js');
      const { item, firstReadingKind } = await import('./js/data.js');
      const it = item('k:時');
      const first = firstReadingKind(it), second = first === 'on' ? 'kun' : 'on';
      window.__t = Date.now() - 30 * 3600e3;
      return { first, second, say: { on: sp.kanjiReadingsToSay(it, 'on'), kun: sp.kanjiReadingsToSay(it, 'kun') } };
    }""")
    first, second = info['first'], info['second']
    print(info)

    # 1. The meaning alone.
    shown = lesson("item('k:時')")
    check(shown['dts'] == [] and shown['said'] == [], 'the first lesson shows no readings and reads nothing aloud')
    check('teaches the meaning' in shown['note'] and shown['step'].startswith('Kanji meaning'), 'and says the readings come later')
    r = pg.evaluate(STEP, ['k:時', 5])
    print(r)
    check(r['types'] == ['m'] and r['cards'] == ['m'], 'it creates only the meaning card')
    check(not r['queuedBefore'], 'no reading lesson while the meaning is still being learned')
    check(r['next'] == first, f'once the meaning has been reviewed, the {first} is the next lesson')

    # 2. The first kind of reading.
    shown = lesson("st.lessonQueue(5000).find((x) => x.id === 'k:時')")
    check(len(shown['dts']) == 1 and shown['said'] and all(s in info['say'][first] for s in shown['said']),
          f"the {first} lesson shows and reads only the {first} ({shown['said']})")
    check('meaning earlier' in shown['note'] and 'comes once' in shown['note'], f"it notes the meaning came first and the {second} comes next")
    r = pg.evaluate(STEP, ['k:時', 5])
    print(r)
    check(r['cards'] == sorted(['m', first], key=['m', 'on', 'kun'].index), f'it adds only the {first} card')
    check(not r['queuedBefore'] and r['next'] == second, f'the {second} waits for that review, then comes next')

    # 3. The other kind.
    shown = lesson("st.lessonQueue(5000).find((x) => x.id === 'k:時')")
    check(len(shown['dts']) == 1 and all(s in info['say'][second] for s in shown['said']), f'the {second} lesson shows and reads only the {second}')
    r = pg.evaluate(STEP, ['k:時', 5])
    check(r['cards'] == ['m', 'on', 'kun'] and r['pending'] == [] and r['next'] is None, 'afterwards the kanji has every card and nothing left')

    # A kanji that's also a radical you know with the same meaning: meaning and first reading together.
    r = pg.evaluate("""async () => {
      const st = await import('./js/state.js');
      const { item, firstReadingKind } = await import('./js/data.js');
      await st.introduceItems([item('r:口')], new Date(Date.now() - 50 * 3600e3));
      return { types: st.lessonTypes(item('k:口')), first: firstReadingKind(item('k:口')) };
    }""")
    check(r['types'] == ['m', r['first']], f"口 (known as a radical) starts with its meaning and {r['first']}")
    shown = lesson("item('k:口')")
    check('from the radical 口' in shown['note'] and len(shown['dts']) == 1, 'and its card says the meaning comes from the radical')

    # Not a known radical yet: meaning alone.
    r = pg.evaluate("""async () => (await import('./js/state.js')).lessonTypes((await import('./js/data.js')).item('k:目'))""")
    check(r == ['m'], '目 before its radical is learned starts with the meaning alone')

    # With the setting off, one lesson teaches everything.
    off = pg.evaluate("""async () => {
      const st = await import('./js/state.js');
      const { item } = await import('./js/data.js');
      await st.saveSettings({ splitReadings: false });
      const t = st.lessonTypes(item('k:月'));
      await st.saveSettings({ splitReadings: true });
      return t;
    }""")
    check(off == ['m', 'on', 'kun'], 'with step-by-step lessons off, one lesson teaches all')
    check(not errors, 'no page errors' + ('' if not errors else ': ' + '; '.join(errors)))
    b.close()
