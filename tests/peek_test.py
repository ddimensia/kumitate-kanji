"""Usage: serve the app, then: python3 tests/peek_test.py http://localhost:8000/
Opening an item mid-session shows it over the session; back (button, Esc or the browser's)
returns to the same place in the session."""
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000/'


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print('ok -', msg)


LINK = '.view-root a[href^="#item/"]'

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1000, 'height': 900})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))

    pg.goto(BASE + '#browse')  # anything but Today counts as having seen the welcome page
    pg.wait_for_selector('.browse, .page', state='attached')
    pg.goto(BASE + '#today')
    pg.wait_for_selector('[data-act="lessons"]')
    pg.click('[data-act="lessons"]')
    pg.wait_for_function("location.hash === '#study'")
    # Move on a little so there's a place to come back to.
    pg.wait_for_selector(LINK)
    before = pg.inner_text('.view-root')
    history_len = pg.evaluate('history.length')

    href = pg.get_attribute(LINK, 'href')
    pg.click(LINK)
    pg.wait_for_selector('dialog.peek[open]')
    check(pg.evaluate('location.hash') == '#study', 'the session stays on the study screen')
    check(pg.locator('dialog.peek .item-page .info-glyph').count() > 0, f'the item ({href}) opens over the session')
    check(pg.locator('dialog.peek [data-act="reset"], dialog.peek .level-picker').count() == 0,
          'no reset or level picker mid-session')

    # A link inside the window opens the next item in it.
    inner = pg.locator(f'dialog.peek a[href^="#item/"]:not([href="{href}"])')
    if inner.count():
        first_title = pg.inner_text('dialog.peek .peek-body')
        inner.first.click()
        pg.wait_for_function('(t) => document.querySelector("dialog.peek .peek-body").innerText !== t', arg=first_title)
        check(pg.evaluate('history.length') == history_len + 2, 'each item is a history entry')
        pg.go_back()
        pg.wait_for_function('(t) => document.querySelector("dialog.peek .peek-body").innerText === t', arg=first_title)
        check(pg.locator('dialog.peek[open]').count() == 1, 'back returns to the previous item')

    pg.go_back()
    pg.wait_for_selector('dialog.peek', state='hidden')
    check(pg.evaluate('location.hash') == '#study', 'back closes the window, still on the study screen')
    check(pg.inner_text('.view-root') == before, 'the session is where it was')

    # Esc and the close button work too.
    pg.click(LINK)
    pg.wait_for_selector('dialog.peek[open]')
    pg.keyboard.press('Escape')
    pg.wait_for_selector('dialog.peek', state='hidden')
    check(pg.inner_text('.view-root') == before, 'Esc returns to the session')
    pg.click(LINK)
    pg.wait_for_selector('dialog.peek[open]')
    pg.click('[data-peek-close]')
    pg.wait_for_selector('dialog.peek', state='hidden')
    check(pg.inner_text('.view-root') == before, 'the close button returns to the session')
    check(pg.evaluate("!document.querySelector('dialog[open]') && document.body.dataset.route === 'study'"),
          'nothing left open, so keys reach the session again')

    # Outside a session, item links are ordinary pages.
    pg.goto(BASE + '#browse')
    pg.wait_for_selector('.view-root a[href^="#item/"]')
    pg.click('.view-root a[href^="#item/"]')
    pg.wait_for_function("location.hash.startsWith('#item/')")
    check(pg.locator('dialog.peek[open]').count() == 0, 'outside a session, links open the item page')

    check(not errors, 'no page errors' + ('' if not errors else ': ' + '; '.join(errors)))
    b.close()
