"""Usage: serve the app, then: python3 tests/lesson_order_test.py http://localhost:8000/
Lessons stay at your level: N1 kanji placed as known (as a WaniKani import does) don't pull
their N1 words into lessons while you're on N5, unless "Lessons from" is "Anything unlocked"."""
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000/'


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print('ok -', msg)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(BASE + '#browse')
    pg.wait_for_selector('.browse, .page', state='attached')

    r = pg.evaluate("""async () => {
      const st = await import('./js/state.js');
      const { curriculum, item } = await import('./js/data.js');
      const db = curriculum();
      const levels = (q) => [...new Set(q.map((it) => it.level))].sort();
      const before = { level: st.currentLevel(), levels: levels(st.lessonQueue(200)) };

      // Words in the first 300 items of the course are at N5 or N4.
      const early = db.order.slice(0, 300).map((id) => db.items.get(id)).filter((it) => it.kind === 'v');
      const earlyLevels = [...new Set(early.map((v) => v.level))].sort();

      // Mark some N1 kanji (and their parts) as known, as a WaniKani import would.
      const n1 = [...db.items.values()].filter((it) => it.kind === 'k' && it.jlpt === 1).slice(0, 40);
      await st.setLevel([...new Set([...n1, ...n1.flatMap((k) => st.unstudiedParts(k))])], 'mastered');
      const n1Words = n1.flatMap((k) => k.vocab.map(item)).filter((v) => v.level === 1 && v.prereq.every((k) => st.isPassed(k)));
      const after = { level: st.currentLevel(), levels: levels(st.lessonQueue(5000)) };

      await st.saveSettings({ lessonsAhead: 'all' });
      const all = st.lessonQueue(5000);
      const openN1 = n1Words.filter((v) => all.includes(v)).length;
      await st.saveSettings({ lessonsAhead: 'next' });
      return { before, earlyLevels, after, n1Words: n1Words.length, openN1 };
    }""")
    print(r)
    check(r['before']['level'] == 5, 'a new learner is on N5')
    check(r['before']['levels'] and all(l >= 4 for l in r['before']['levels']), 'lessons start with N5 and N4 items')
    check(all(l >= 4 for l in r['earlyLevels']), 'no N3 or harder words in the first 300 items')
    check(r['after']['level'] == 5, 'imported N1 kanji leave you on N5')
    check(all(l >= 4 for l in r['after']['levels']), 'their N1 words stay out of lessons')
    check(r['n1Words'] > 0 and r['openN1'] == r['n1Words'], '"Anything unlocked" offers them')

    pg.goto(BASE + '#settings')
    pg.wait_for_selector('select[name="lessonsAhead"]')
    check(pg.input_value('select[name="lessonsAhead"]') == 'next', 'Settings shows "Lessons from"')
    check(not errors, 'no page errors' + ('' if not errors else ': ' + '; '.join(errors)))
    b.close()
