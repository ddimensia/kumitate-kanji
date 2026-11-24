"""Usage: serve the app, then: python3 tests/hint_test.py http://localhost:8000/
Enter on a blank reading answer gives a hint (words you know that use the reading, or which
kind of reading each kanji in a word uses); Enter again marks it wrong; a right answer after a
hint is graded Hard, so it comes back sooner than one answered without."""
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

    ids = pg.evaluate("""async () => {
      const st = await import('./js/state.js');
      const { curriculum, item } = await import('./js/data.js');
      const db = curriculum();
      const word = (w) => [...db.items.values()].find((x) => x.kind === 'v' && x.w === w);
      // Known: the kanji 学 and 校 and the word 学校; 生 known but none of its words.
      const t = new Date(Date.now() - 10 * 86400e3);
      await st.setLevel([item('k:学'), item('k:校'), item('k:生'), word('学校')], 'settling', t);
      return { gakkou: word('学校').id };
    }""")

    def start(cards, mode='review'):
        pg.evaluate("""async ([cards, mode]) => {
          const q = await import('./js/quiz.js');
          window.__done = null;
          q.runQuiz(document.querySelector('#view') || document.querySelector('main'), cards,
            { mode, onDone: (r) => { window.__done = r; }, setKeys() {}, title: 'Test' });
        }""", [cards, mode])
        pg.wait_for_selector('.q-input')

    def blank():
        pg.fill('.q-input', '')
        pg.keyboard.press('Enter')
        pg.wait_for_timeout(100)
        return pg.inner_text('.q-note')

    # A kanji's on'yomi: hinted with a word you know.
    start(['k:学/on'], 'practice')
    note = blank()
    check(note.startswith('Hint: as in 学校'), f"学 on'yomi hint names a known word ({note})")
    check('がく' not in note and 'ガク' not in note, 'without giving the reading')
    blank()
    check(pg.locator('.q-form.is-wrong').count() == 1, 'Enter again marks it wrong')

    # A word's reading: which kind each kanji uses.
    start([ids['gakkou'] + '/r'], 'practice')
    note = blank()
    check("学 on'yomi + 校 on'yomi" in note, f'学校 hint gives the reading kinds ({note})')

    # No word known for 生: no hint, the old "Enter again" prompt.
    start(['k:生/on'], 'practice')
    note = blank()
    check(not note.startswith('Hint'), f'no hint without a known word ({note})')

    # Graded: right with a hint counts as Hard, so it's due sooner than right without.
    start(['k:学/on', 'k:校/on'], 'review')
    for _ in range(2):
        card = pg.get_attribute('.q-card', 'data-card')
        if card == 'k:学/on':
            blank()
        pg.fill('.q-input', 'がく' if card == 'k:学/on' else 'こう')
        pg.keyboard.press('Enter')
        pg.wait_for_selector('.q-after .q-next')
        if card == 'k:学/on':
            check(pg.inner_text('.q-note') == 'Right, with a hint.', 'right after a hint says so')
        pg.click('.q-after .q-next')
        pg.wait_for_timeout(100)
    pg.wait_for_function('window.__done')
    r = pg.evaluate("""async () => {
      const store = await import('./js/store.js');
      const cards = await store.getAll('cards');
      const due = (id) => new Date(cards.find((x) => x.id === id).srs.due).getTime();
      const logs = await store.getAll('log');
      return { hinted: due('k:学/on'), plain: due('k:校/on'), logged: logs.filter((l) => l.hinted).map((l) => l.card), summary: window.__done.hinted };
    }""")
    print(r)
    check(r['hinted'] < r['plain'], 'the hinted card is due sooner (graded Hard, not Good)')
    check(r['logged'] == ['k:学/on'], 'the review log marks it as hinted')
    check(r['summary'] == 1, 'the session counts one hinted answer')
    check(not errors, 'no page errors' + ('' if not errors else ': ' + '; '.join(errors)))
    b.close()
