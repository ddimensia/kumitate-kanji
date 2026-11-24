"""Usage: serve the app, then: python3 tests/retry_test.py http://localhost:8000/
A card missed again and again comes back sooner each time (3–6 cards later, then 1–2, then
straight away), and once it's right after that, once more a few cards later to check."""
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000/'
CHARS = '一二三四五六七八九十百千万円上下中大小人日月火水木'


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
    pg.evaluate("""async (ids) => {
      const q = await import('./js/quiz.js');
      window.__done = null;
      q.runQuiz(document.querySelector('#view') || document.querySelector('main'), ids,
        { mode: 'practice', onDone: (r) => { window.__done = r; }, setKeys() {}, title: 'Extra study' });
    }""", [f'k:{c}/m' for c in CHARS])

    seq, misses, TARGET = [], 0, None
    for _ in range(40):
        if pg.evaluate('window.__done'):
            break
        pg.wait_for_selector('.q-input:not([readonly])')
        card = pg.get_attribute('.q-card', 'data-card')
        seq.append(card)
        TARGET = TARGET or card  # miss the first card shown
        if card == TARGET and misses < 3:
            misses += 1
            answer = 'zzzz'
        else:
            answer = pg.evaluate("async (id) => { const d = await import('./js/data.js'); return d.meanings(d.item(id.split('/')[0]))[0]; }", card)
        pg.fill('.q-input', answer)
        pg.keyboard.press('Enter')
        pg.wait_for_selector('.q-after .q-next')
        pg.click('.q-after .q-next')
        pg.wait_for_timeout(50)

    at = [i for i, c in enumerate(seq) if c == TARGET]
    gaps = [b - a - 1 for a, b in zip(at, at[1:])]
    print('target asked at', at, 'cards in between:', gaps)
    check(len(at) == 5, 'missed three times, then right, then right on the check: asked 5 times')
    check(3 <= gaps[0] <= 6, 'after the first miss it comes back 3–6 cards later')
    check(1 <= gaps[1] <= 2, 'after the second, 1–2 cards later')
    check(gaps[2] == 0, 'after the third, straight away')
    check(3 <= gaps[3] <= 6, 'once right, once more a few cards later to check it stuck')
    check(pg.evaluate('window.__done.complete'), 'the session finishes')
    # The end of Extra study: "again" practises only the missed cards.
    pg.evaluate('''async (ids) => {
      const { runPractice } = await import('./js/views/practice.js');
      window.__again = null;
      runPractice(document.querySelector('#view') || document.querySelector('main'), ids,
        { setKeys() {}, onExit() {}, again: (which) => { window.__again = which; } });
    }''', ['k:一/m', 'k:二/m', 'k:三/m'])
    missed_once = False
    for _ in range(10):
        if pg.locator('.summary').count():
            break
        pg.wait_for_selector('.q-input:not([readonly])')
        card = pg.get_attribute('.q-card', 'data-card')
        if card == 'k:二/m' and not missed_once:
            missed_once, answer = True, 'zzzz'
        else:
            answer = pg.evaluate("async (id) => { const d = await import('./js/data.js'); return d.meanings(d.item(id.split('/')[0]))[0]; }", card)
        pg.fill('.q-input', answer)
        pg.keyboard.press('Enter')
        pg.wait_for_selector('.q-after .q-next')
        pg.click('.q-after .q-next')
        pg.wait_for_timeout(50)
    pg.wait_for_selector('.summary')
    check(pg.inner_text('[data-act="missed"]') == 'Practise the missed one again', 'the summary offers the missed card')
    pg.click('[data-act="missed"]')
    check(pg.evaluate('window.__again') == ['k:二/m'], 'and practising again uses only that card')
    check(pg.inner_text('[data-act="all"]') == 'All 3 again', 'with the whole set still an option')
    pg.click('[data-act="all"]')
    check(len(pg.evaluate('window.__again')) == 3, 'which practises all three')

    check(not errors, 'no page errors' + ('' if not errors else ': ' + '; '.join(errors)))
    b.close()
