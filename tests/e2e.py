"""End-to-end test: python3 tests/e2e.py [base_url]

Runs a full first week with a fake clock: a lesson batch and its quiz (including a wrong
answer that's undone, a typo that's retried and a wrong-kind answer), reviews ten minutes
later, reviews two days later until items pass, and checks that words unlock after their
kanji. Needs Playwright for Python and Chrome (or Playwright's Chromium).
"""
import asyncio, shutil, sys, datetime as dt
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'

# The right answer for the card on screen, from the app's own data module.
ANSWER_JS = """async () => {
  const d = await import('./js/data.js');
  const id = document.querySelector('.q-card').dataset.card;
  const [itemId, type] = d.splitCardId(id);
  const it = d.item(itemId);
  if (type === 'm') return { id, type, answer: d.meanings(it)[0] };
  if (type === 'r') return { id, type, answer: it.readings[0] };
  return { id, type, answer: d.readingAnswers(it, type)[0] };
}"""


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print('ok -', msg)


async def answer_current(pg, mutate=None):
    info = await pg.evaluate(ANSWER_JS)
    text = mutate(info) if mutate else info['answer']
    await pg.fill('.q-input', '')
    await pg.type('.q-input', text)
    await pg.press('.q-input', 'Enter')
    return info


async def finish_quiz(pg, limit=200):
    """Answer everything correctly until the quiz screen goes away."""
    for _ in range(limit):
        if not await pg.query_selector('.q-input'):
            return
        await answer_current(pg)
        await pg.wait_for_selector('.q-form.is-right, .q-form.is-wrong')
        await pg.keyboard.press('Enter')
        await pg.wait_for_timeout(30)
    raise AssertionError('quiz did not finish')


async def main():
    async with async_playwright() as p:
        chrome = shutil.which('google-chrome')
        b = await p.chromium.launch(executable_path=chrome) if chrome else await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1000, 'height': 900})
        pg = await ctx.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        start = dt.datetime(2026, 1, 5, 9, 0)
        await pg.clock.install(time=start)
        await pg.goto(BASE + '#today')
        await pg.wait_for_selector('.today')

        # --- Lesson batch ---
        await pg.click('[data-act="lessons"]')
        await pg.wait_for_selector('.lesson')
        n = len(await pg.query_selector_all('.lesson-tabs button'))
        check(n == 5, 'first lesson has 5 items')
        for _ in range(n):
            await pg.keyboard.press('ArrowRight')
        await pg.wait_for_selector('.quiz')

        # A typo in a reading (one kana off) is not graded: try again.
        # A wrong answer can be undone with Backspace.
        did_typo = did_undo = did_enter_blur = did_reading_btn = False
        for _ in range(60):
            if not await pg.query_selector('.q-input'):
                break
            info = await pg.evaluate(ANSWER_JS)
            if not did_undo and info['type'] == 'm':
                await pg.fill('.q-input', 'zzzz')
                await pg.press('.q-input', 'Enter')
                await pg.wait_for_selector('.q-form.is-wrong')
                await pg.keyboard.press('Backspace')
                await pg.wait_for_selector('.q-input:not([readonly])')
                check(await pg.input_value('.q-input') == 'zzzz', 'undo restores the wrong answer for editing')
                did_undo = True
            elif not did_typo and info['type'] == 'on' and len(info['answer']) >= 3:
                wrong = info['answer'][:-1] + ('か' if info['answer'][-1] != 'か' else 'き')
                await pg.fill('.q-input', wrong)
                await pg.press('.q-input', 'Enter')
                note = await pg.text_content('.q-note')
                check('typo' in note.lower() and not await pg.query_selector('.q-form.is-wrong'),
                      f'typo {wrong} for {info["answer"]} asks to try again')
                did_typo = True
            await answer_current(pg)
            await pg.wait_for_selector('.q-form.is-right')
            if info['type'] != 'm' and not did_reading_btn:
                did_reading_btn = bool(await pg.query_selector('.q-answer .q-reading[data-say]'))
            if not did_enter_blur:
                # Enter advances even when the answer box isn't focused.
                before = await pg.get_attribute('.q-card', 'data-card')
                await pg.evaluate('document.activeElement.blur()')
                await pg.keyboard.press('Enter')
                await pg.wait_for_timeout(50)
                after = await pg.get_attribute('.q-card', 'data-card') if await pg.query_selector('.q-card') else None
                did_enter_blur = after != before or not await pg.query_selector('.q-form.is-right')
                continue
            await pg.keyboard.press('Enter')
            await pg.wait_for_timeout(30)
        check(did_undo, 'undo was exercised')
        check(did_enter_blur and did_reading_btn, 'Enter moves on without focus; readings are clickable buttons')
        await pg.wait_for_selector('.summary')
        check('Learned 5 new items' in await pg.text_content('.summary h2'), 'lesson summary')
        await pg.click('[data-act="done"]')
        await pg.wait_for_selector('.today')
        check((await pg.text_content('.hero.lessons .hero-count')).strip() == '10', '10 lessons left today')

        # Wrong kind of answer: kun'yomi given for an on'yomi card is not graded.
        res = await pg.evaluate("""async () => {
          const d = await import('./js/data.js'); const a = await import('./js/answer.js');
          return a.checkReading(d.item('k:日'), 'on', 'ひ');
        }""")
        check(res['verdict'] == 'retry', 'kun given for on is a retry')

        # --- Ten minutes later: first reviews ---
        await pg.clock.set_system_time(start + dt.timedelta(minutes=11))
        await pg.reload()
        await pg.wait_for_selector('.today')
        due = int((await pg.text_content('.hero.reviews .hero-count')).strip())
        check(due >= 10, f'{due} reviews due after ten minutes')
        await pg.click('[data-act="reviews"]')
        await pg.wait_for_selector('.quiz')
        await finish_quiz(pg)
        await pg.wait_for_selector('.summary')
        check('100% right' in await pg.text_content('.summary h2'), 'review summary shows 100%')

        # Vocabulary is still locked: its kanji haven't passed yet.
        locked = await pg.evaluate("""async () => {
          const s = await import('./js/state.js'); const d = await import('./js/data.js');
          return s.lessonQueue(50).filter((it) => it.kind === 'v').length;
        }""")
        check(locked == 0, 'no words unlocked before their kanji pass')

        # --- Two and a half days later: reviews pass the items ---
        await pg.clock.set_system_time(start + dt.timedelta(hours=60))
        await pg.goto(BASE + '#today')
        await pg.reload()
        await pg.wait_for_selector('.today')
        await pg.click('[data-act="reviews"]')
        await pg.wait_for_selector('.quiz')
        await finish_quiz(pg)
        await pg.wait_for_selector('.summary')
        text = await pg.text_content('.summary')
        check('Newly unlocked' in text, 'passing reviews unlock new items')
        vocab = await pg.evaluate("""async () => {
          const s = await import('./js/state.js');
          return s.lessonQueue(400).filter((it) => it.kind === 'v').map((it) => it.w).slice(0, 5);
        }""")
        check(len(vocab) > 0, f'words unlocked after their kanji: {" ".join(vocab)}')

        # --- Browse and item pages render ---
        await pg.goto(BASE + '#browse/k/5')
        await pg.wait_for_selector('.grid .tile')
        check(len(await pg.query_selector_all('.grid .tile')) == 79, 'browse lists the 79 N5 kanji')
        await pg.goto(BASE + '#item/' + 'k:%E6%97%A5')
        await pg.wait_for_selector('.hist')
        check('Meaning' in await pg.text_content('.hist'), 'item page shows progress')
        await pg.goto(BASE + '#settings')
        await pg.wait_for_selector('.settings-form')

        check(not errors, 'no console errors' + ('' if not errors else ': ' + '; '.join(errors)))
        await b.close()


asyncio.run(main())
