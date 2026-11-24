"""Usage: serve the app, then: python3 tests/split_test.py http://localhost:8000/
A kanji's on'yomi and kun'yomi are taught in separate lessons: the first lesson teaches its
meaning and one kind of reading (and reads only that kind aloud), the other kind becomes its
own lesson once the first part has passed its first review."""
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
        """Show a lesson for the entry and return what's said and shown on its card."""
        pg.evaluate("window.__said = []")
        pg.evaluate(f"""async () => {{
          const {{ runLessons }} = await import('./js/views/lessons.js');
          const st = await import('./js/state.js');
          const {{ item }} = await import('./js/data.js');
          window.__entry = {entry_js};
          runLessons({ROOT}, [window.__entry], {{ setKeys() {{}}, onExit() {{}}, again() {{}} }});
        }}""")
        pg.wait_for_selector('.lesson-card .info')
        pg.wait_for_timeout(300)
        return {
            'said': pg.evaluate('window.__said'),
            'note': pg.inner_text('.lesson-focus-note') if pg.locator('.lesson-focus-note').count() else '',
            'dts': [t for t in pg.locator('.lesson-card dl.readings dt').all_inner_texts() if t.startswith(('On', 'Kun'))],
        }

    info = pg.evaluate("""async () => {
      const st = await import('./js/state.js');
      const sp = await import('./js/speech.js');
      const { item, firstReadingKind } = await import('./js/data.js');
      const it = item('k:日');
      const first = firstReadingKind(it), second = first === 'on' ? 'kun' : 'on';
      return { first, second, types: st.lessonTypes(it),
               firstSay: sp.kanjiReadingsToSay(it, first), secondSay: sp.kanjiReadingsToSay(it, second) };
    }""")
    print(info)
    check(info['types'] == ['m', info['first']], "日's first lesson teaches its meaning and one kind of reading")

    # The first lesson: one kind shown and said.
    shown = lesson("item('k:日')")
    check(shown['said'] and all(s in info['firstSay'] for s in shown['said']), f"it reads only the {info['first']} aloud ({shown['said']})")
    check(len(shown['dts']) == 1, f"only that kind of reading is shown ({shown['dts']})")
    check('gets its own lesson' in shown['note'], 'and says the other kind comes later')

    # Finishing it creates only those cards and saves the other reading.
    r = pg.evaluate("""async () => {
      const st = await import('./js/state.js');
      const { item } = await import('./js/data.js');
      const it = item('k:日');
      const t0 = new Date(Date.now() - 10 * 3600e3);
      await st.introduceItems([it], t0);
      const has = (t) => !!st.getCard('k:日/' + t);
      const before = st.lessonQueue(5000).some((x) => x.id === 'k:日');
      // Its first review, 5 hours later: right.
      for (const t of st.lessonTypes(it)) await st.recordAnswer('k:日/' + t, true, new Date(t0.getTime() + 5 * 3600e3));
      const q = st.lessonQueue(5000);
      const entry = q.find((x) => x.id === 'k:日');
      return { m: has('m'), on: has('on'), kun: has('kun'), before, after: entry ? entry.lessonReading : null,
               position: q.findIndex((x) => x.id === 'k:日') };
    }""")
    print(r)
    check(r['m'] and r[info['first']] and not r[info['second']], 'the first lesson creates the meaning and first-reading cards only')
    check(not r['before'], 'the second reading waits while the first part is still being learned')
    check(r['after'] == info['second'], f"after its first review, the {info['second']} is its own lesson")
    check(0 <= r['position'] < 5, 'at the front of the queue, in course order')

    # The second lesson: the other kind, said and shown alone.
    shown = lesson("st.lessonQueue(5000).find((x) => x.id === 'k:日')")
    check(shown['said'] and all(s in info['secondSay'] for s in shown['said']), f"it reads only the {info['second']} aloud ({shown['said']})")
    check(len(shown['dts']) == 1 and 'earlier' in shown['note'], 'shows only that kind, noting the first came earlier')
    check(pg.locator('.lesson-card .syn-editor').count() == 0, 'no meaning editor on a reading lesson')

    # Its quiz asks just that reading, then the kanji has every card.
    pg.click('[data-act="next"]')
    pg.wait_for_selector('.q-card')
    cards = pg.evaluate("[...document.querySelectorAll('.q-card')].map((e) => e.dataset.card)")
    check(cards == [f"k:日/{info['second']}"], f'the quiz asks only that reading ({cards})')
    answer = pg.evaluate(f"""async () => {{
      const {{ item, readingAnswers }} = await import('./js/data.js');
      return readingAnswers(item('k:日'), '{info['second']}', {{ commonOnly: true }})[0];
    }}""")
    pg.fill('.q-input', answer)
    pg.keyboard.press('Enter')
    pg.wait_for_selector('.q-after .q-next')
    pg.click('.q-after .q-next')
    pg.wait_for_selector('.summary')
    done = pg.evaluate("""async () => {
      const st = await import('./js/state.js');
      return { all: ['m', 'on', 'kun'].every((t) => !!st.getCard('k:日/' + t)),
               queued: st.lessonQueue(5000).some((x) => x.id === 'k:日') };
    }""")
    check(done['all'] and not done['queued'], 'afterwards the kanji has every card and no lesson left')

    # With the setting off, a kanji's lesson teaches everything at once.
    off = pg.evaluate("""async () => {
      const st = await import('./js/state.js');
      const { item } = await import('./js/data.js');
      await st.saveSettings({ splitReadings: false });
      const t = st.lessonTypes(item('k:月'));
      await st.saveSettings({ splitReadings: true });
      return t;
    }""")
    check(off == ['m', 'on', 'kun'], 'with "Separate reading lessons" off, one lesson teaches all')
    check(not errors, 'no page errors' + ('' if not errors else ': ' + '; '.join(errors)))
    b.close()
