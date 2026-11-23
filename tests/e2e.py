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
  return { id, type, answer: d.readingAnswers(it, type, { taughtOnly: true })[0] };
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
        # Record what would be spoken (the test browser has no Japanese voice).
        await ctx.add_init_script("""
          window.__said = [];
          if (window.speechSynthesis) window.speechSynthesis.speak = (u) => window.__said.push(u.text);
        """)
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
        did_typo = did_undo = did_enter_blur = did_reading_btn = did_kata = did_blank = did_tap_next = False
        async def run_checked_quiz():
            # Answers every card right, exercising each special case once along the way.
            nonlocal did_typo, did_undo, did_enter_blur, did_reading_btn, did_kata, did_blank, did_tap_next
            for _ in range(60):
                if not await pg.query_selector('.q-input'):
                    break
                info = await pg.evaluate(ANSWER_JS)
                if not did_blank:
                    # Enter on a blank answer asks again; Enter a second time marks it wrong.
                    await pg.fill('.q-input', '')
                    await pg.press('.q-input', 'Enter')
                    await pg.wait_for_timeout(50)
                    first_ok = not await pg.query_selector('.q-form.is-wrong') and 'again' in (await pg.text_content('.q-note'))
                    await pg.press('.q-input', 'Enter')
                    await pg.wait_for_selector('.q-form.is-wrong')
                    check(first_ok, 'blank answer: first Enter asks again, second marks it wrong')
                    await pg.keyboard.press('Backspace')
                    await pg.wait_for_selector('.q-input:not([readonly])')
                    did_blank = True
                if not did_undo and info['type'] == 'm':
                    await pg.fill('.q-input', 'zzzz')
                    await pg.press('.q-input', 'Enter')
                    await pg.wait_for_selector('.q-form.is-wrong')
                    await pg.keyboard.press('Backspace')
                    await pg.wait_for_selector('.q-input:not([readonly])')
                    check(await pg.input_value('.q-input') == 'zzzz', 'undo restores the wrong answer for editing')
                    did_undo = True
                elif not did_kata and info['type'] == 'on':
                    romaji = await pg.evaluate("async (k) => (await import('./vendor/wanakana.js')).toRomaji(k)", info['answer'])
                    if romaji.endswith('n'):
                        romaji += 'n'  # a final n stays latin until the next key, as with any kana input
                    await pg.fill('.q-input', '')
                    await pg.type('.q-input', romaji)
                    shown = await pg.input_value('.q-input')
                    check(shown == await pg.evaluate("async (k) => (await import('./vendor/wanakana.js')).toKatakana(k)", info['answer']),
                          f'on\'yomi input shows katakana ({romaji} -> {shown})')
                    await pg.press('.q-input', 'Enter')
                    await pg.wait_for_selector('.q-form.is-right')
                    await pg.keyboard.press('Enter')
                    await pg.wait_for_timeout(30)
                    did_kata = True
                    continue
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
                if not did_tap_next:
                    # Tapping ➜ after answering moves on (phones have no Enter key to press).
                    before = await pg.get_attribute('.q-card', 'data-card')
                    await pg.click('.q-submit')
                    await pg.wait_for_timeout(50)
                    after = await pg.get_attribute('.q-card', 'data-card') if await pg.query_selector('.q-card') else None
                    did_tap_next = after != before or not await pg.query_selector('.q-form.is-right')
                    check(did_tap_next, 'tapping the ➜ button after answering goes to the next card')
                    continue
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
        await run_checked_quiz()
        check(did_undo, 'undo was exercised')
        check(did_enter_blur, 'Enter moves on without focus')
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

        # --- Nothing is due during the cooling-off period after a lesson ---
        await pg.clock.set_system_time(start + dt.timedelta(minutes=30))
        await pg.reload()
        await pg.wait_for_selector('.today')
        due = int((await pg.text_content('.hero.reviews .hero-count')).strip())
        check(due == 0, 'no reviews 30 minutes after a lesson (first review waits 4 hours)')

        # --- Four hours later: first reviews, with one miss ---
        await pg.clock.set_system_time(start + dt.timedelta(hours=4, minutes=5))
        await pg.reload()
        await pg.wait_for_selector('.today')
        due = int((await pg.text_content('.hero.reviews .hero-count')).strip())
        check(due >= 5, f'{due} reviews due after four hours (one per radical)')
        await pg.click('[data-act="reviews"]')
        await pg.wait_for_selector('.quiz')
        missed = await pg.get_attribute('.q-card', 'data-card')
        await pg.fill('.q-input', 'zzzz')
        await pg.press('.q-input', 'Enter')
        await pg.wait_for_selector('.q-form.is-wrong')
        await pg.keyboard.press('Enter')
        await finish_quiz(pg)
        await pg.wait_for_selector('.summary')
        check('right' in await pg.text_content('.summary h2'), 'review summary')

        # --- Extra study: the miss is listed, and practising it leaves its schedule alone ---
        await pg.click('[data-act="done"]')
        await pg.wait_for_selector('.today')
        await pg.wait_for_selector('.mistakes-panel')
        check(await pg.query_selector(f'.mistakes-panel .tile[href="#item/{missed.split("/")[0].replace(":", "%3A")}"]') is not None
              or missed.split('/')[0] in await pg.evaluate("""async () => (await import('./js/state.js')).recentMistakes().items.map((m) => m.it.id)"""),
              'the missed card shows under Recent mistakes')
        due_js = f"""async () => (await import('./js/state.js')).getCard('{missed}').srs.due"""
        before = await pg.evaluate(due_js)
        await pg.click('[data-act="practice"]')
        await pg.wait_for_selector('.quiz')
        await finish_quiz(pg)
        await pg.wait_for_selector('.summary')
        check('right first time' in await pg.text_content('.summary h2'), 'extra study summary')
        check(await pg.evaluate(due_js) == before, 'extra study does not change the review schedule')
        await pg.click('[data-act="done"]')
        await pg.wait_for_selector('.today')

        # The missed card comes back after an hour, not ten minutes.
        await pg.clock.set_system_time(start + dt.timedelta(hours=4, minutes=30))
        await pg.reload()
        await pg.wait_for_selector('.today')
        check(missed not in await pg.evaluate("async () => (await import('./js/state.js')).dueCardIds()"), 'a missed card waits before coming back')
        await pg.clock.set_system_time(start + dt.timedelta(hours=5, minutes=30))
        await pg.reload()
        await pg.wait_for_selector('.today')
        await pg.click('[data-act="reviews"]')
        await pg.wait_for_selector('.quiz')
        await finish_quiz(pg)
        await pg.wait_for_selector('.summary')

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
        kinds = await pg.evaluate("""async () => {
          const s = await import('./js/state.js');
          return s.lessonQueue(400).map((it) => it.id);
        }""")
        check('k:日' in kinds and not any(k.startswith('v:') for k in kinds),
              'passing the 日 radical unlocks the 日 kanji, but no words yet')

        # --- Learn the unlocked kanji, then pass them: their words unlock ---
        await pg.click('[data-act="done"]')
        await pg.wait_for_selector('.today')
        await pg.evaluate("""async () => {
          const s = await import('./js/state.js');
          await s.saveSettings({ dailyMax: 100, batchSize: 10 });
        }""")
        await pg.reload()
        await pg.wait_for_selector('.today')
        await pg.click('[data-act="lessons"]')
        await pg.wait_for_selector('.lesson')
        first = await pg.get_attribute('.lesson .info', 'data-item')
        said = await pg.evaluate('window.__said')
        check(first.startswith('k:') and len(said) > 0, f'a kanji lesson card reads its readings aloud: {first} {said}')
        n = len(await pg.query_selector_all('.lesson-tabs button'))
        for _ in range(n):
            await pg.keyboard.press('ArrowRight')
        await pg.wait_for_selector('.quiz')
        await pg.evaluate('window.__said = []')
        await run_checked_quiz()
        said = await pg.evaluate('window.__said')
        check(any(all('\u3040' <= ch <= '\u30ff' for ch in x) for x in said), f'kanji readings are said after reading answers: {said[:6]}')
        check(did_kata, "an on'yomi was answered in katakana")
        check(did_reading_btn, 'readings after an answer are clickable buttons')
        await pg.wait_for_selector('.summary')
        # Review whenever the next cards come due (intervals depend on FSRS, so don't
        # hard-code hours), until the kanji pass and their words unlock.
        for _ in range(4):
            next_due = await pg.evaluate("""async () => {
              const s = await import('./js/state.js');
              return Math.min(...s.introducedItems().flatMap((it) => s.itemCards(it)).map((c) => Date.parse(c.srs.due)));
            }""")
            await pg.clock.set_system_time(dt.datetime.fromtimestamp(next_due / 1000 + 60))
            await pg.goto(BASE + '#browse')
            await pg.goto(BASE + '#today')
            await pg.reload()
            await pg.wait_for_selector('.hero.reviews [data-act="reviews"]:not([disabled])')
            await pg.click('[data-act="reviews"]')
            await pg.wait_for_selector('.quiz')
            await finish_quiz(pg)
            await pg.wait_for_selector('.summary')
            unlocked_words = await pg.evaluate("""async () => (await import('./js/state.js')).lessonQueue(400).some((it) => it.kind === 'v')""")
            if unlocked_words:
                break
        vocab = await pg.evaluate("""async () => {
          const s = await import('./js/state.js');
          return s.lessonQueue(400).filter((it) => it.kind === 'v').map((it) => it.w).slice(0, 5);
        }""")
        check(len(vocab) > 0, f'words unlocked after their kanji: {" ".join(vocab)}')

        # --- Browse and item pages render ---
        await pg.goto(BASE + '#browse/k/5')
        await pg.wait_for_selector('.grid .tile')
        check(len(await pg.query_selector_all('.browse > .grid .tile')) == 79, 'browse lists the 79 N5 kanji')
        n_rad = len(await pg.query_selector_all('.level-radicals .tile'))
        check(n_rad > 0, f'N5 kanji page lists the {n_rad} radicals taught with them')
        await pg.goto(BASE + '#browse/r/5/all')
        await pg.wait_for_selector('.browse > .grid .tile')
        check(len(await pg.query_selector_all('.browse > .grid .tile')) == n_rad, 'radicals tab filters by level')
        # The dictionary radical links to the form that's taught (花: 艸 -> 艹).
        await pg.goto(BASE + '#item/k:%E8%8A%B1')
        await pg.wait_for_selector('.dict-link')
        await pg.click('.dict-link')
        await pg.wait_for_function("location.hash.includes(encodeURIComponent('r:艹'))")
        await pg.wait_for_selector('.info-head.kind-r')
        check(True, 'dictionary radical 艸 on 花 opens the 艹 radical')
        await pg.goto(BASE + '#item/' + 'k:%E6%97%A5')
        await pg.wait_for_selector('.hist')
        check('Meaning' in await pg.text_content('.hist'), 'item page shows progress')
        await pg.goto(BASE + '#settings')
        await pg.wait_for_selector('.settings-form')

        # --- Turning "Read kanji and words aloud" off silences lessons and answers ---
        await pg.evaluate("async () => (await import('./js/state.js')).saveSettings({ autoplay: false })")
        await pg.evaluate('window.__said = []')
        await pg.evaluate("""async () => {
          const sp = await import('./js/speech.js'); const d = await import('./js/data.js');
          sp.readAloud(d.item('k:日')); sp.readAloud(d.item('k:日'), 'on');
        }""")
        check(await pg.evaluate('window.__said') == [], 'read-aloud setting off: nothing is said')
        await pg.evaluate("async () => (await import('./js/state.js')).saveSettings({ autoplay: true })")

        # --- Reading setting: rarely needed readings aren't quizzed; switching adds/pauses them ---
        res = await pg.evaluate("""async () => {
          const s = await import('./js/state.js'); const d = await import('./js/data.js');
          const ta = d.item('k:田');
          await s.setLevel([ta], 'solid');
          const before = s.itemCards(ta).map((c) => c.type);
          await s.saveSettings({ readingWindow: 'all' });
          const all = s.itemCards(ta).map((c) => c.type);
          const onDue = s.getCard('k:田/on').srs.due;
          await s.saveSettings({ readingWindow: 2 });
          const after = s.itemCards(ta).map((c) => c.type);
          const later = new Date(Date.parse(onDue) + 60000);
          const dueLater = s.dueCardIds(later).includes('k:田/on');
          await s.setLevel([ta], 'none');
          return { before, all, after, dueLater };
        }""")
        check(res['before'] == ['m', 'kun'], f"田 has meaning and kun'yomi questions by default: {res['before']}")
        check(res['all'] == ['m', 'on', 'kun'], f"'All common readings' adds an on'yomi question: {res['all']}")
        check(res['after'] == ['m', 'kun'] and not res['dueLater'], 'switching back pauses it (never comes due)')

        # --- "Already know it": set a level from the item page, parts included ---
        await pg.goto(BASE + '#item/k:%E5%83%8D')  # 働
        await pg.wait_for_selector('.level-picker')
        learned_before = await pg.evaluate("async () => (await import('./js/state.js')).learnedToday()")
        await pg.select_option('.level-picker select', 'solid')
        await pg.click('.level-picker button')
        await pg.wait_for_selector('.info-stage.st-solid')
        info = await pg.evaluate("""async () => {
          const s = await import('./js/state.js'); const d = await import('./js/data.js');
          const ids = ['k:働', 'r:亻', 'k:動', 'r:力'];
          return { stages: ids.map((i) => s.stage(d.item(i))), passed: s.isPassed('k:働'),
                   learned: s.learnedToday(), due: d.cardTypes(d.item('k:働')).map((t) => s.getCard('k:働/' + t).srs.due) };
        }""")
        check(all(st == 'solid' for st in info['stages']), f"働 and its parts set to solid: {info['stages']}")
        check(info['passed'], '働 counts as passed, so what builds on it unlocks')
        check(info['learned'] == learned_before, "marking items doesn't use up the day's new items")
        days = [(dt.datetime.fromisoformat(d.replace('Z', '+00:00')).timestamp() * 1000 - await pg.evaluate('Date.now()')) / 86400000 for d in info['due']]
        check(all(10 <= x <= 61 for x in days), f'solid items come due within their 60-day stability: {[round(x) for x in days]} days')

        await pg.select_option('.level-picker select', 'none')
        await pg.click('.level-picker button')
        await pg.click('dialog .btn.danger')
        await pg.wait_for_selector('text=Not studied yet')
        check(True, 'setting "Not studied" sends it back to lessons')

        # --- Bulk: select tiles in Browse and set them all ---
        await pg.goto(BASE + '#browse/k/3/all')
        await pg.wait_for_selector('.browse > .grid .tile')
        await pg.click('[data-act="select"]')
        tiles = await pg.query_selector_all('.browse > .grid .tile')
        for t in tiles[:3]:
            await t.click()
        check((await pg.text_content('.sel-count')).strip() == '3 selected', 'tapping tiles selects them instead of opening them')
        check('#browse' in pg.url, 'still on the browse page')
        await pg.select_option('.select-bar .level-picker select', 'mastered')
        await pg.click('.select-bar .level-picker button')
        await pg.wait_for_selector('.browse > .grid .tile.st-mastered')
        n = len(await pg.query_selector_all('.browse > .grid .tile.st-mastered'))
        check(n == 3, f'{n} kanji set to mastered in one go')

        # --- Add a meaning during a lesson and during a quiz ---
        await pg.evaluate("async () => (await import('./js/state.js')).saveSettings({ dailyMax: 500 })")
        await pg.goto(BASE + '#today')
        await pg.reload()
        await pg.wait_for_selector('.today')
        await pg.click('[data-act="lessons"]')
        await pg.wait_for_selector('.lesson .syn-add input')
        item_id = await pg.get_attribute('.lesson .info', 'data-item')
        await pg.fill('.lesson .syn-add input', 'my lesson meaning')
        await pg.press('.lesson .syn-add input', 'Enter')
        await pg.wait_for_selector('.lesson .syn-chip')
        check(await pg.get_attribute('.lesson .info', 'data-item') == item_id, 'Enter in the meaning box adds it without leaving the card')
        n = len(await pg.query_selector_all('.lesson-tabs button'))
        for _ in range(n):
            await pg.keyboard.press('ArrowRight')
        await pg.wait_for_selector('.quiz')
        info = await answer_current(pg)
        await pg.wait_for_selector('.q-form.is-right')
        await pg.click('.q-addsyn')
        await pg.fill('.q-after .syn-add input', 'quiz meaning')
        await pg.press('.q-after .syn-add input', 'Enter')
        await pg.wait_for_selector('.q-after .syn-chip')
        check(await pg.get_attribute('.q-card', 'data-card') == info['id'], 'Enter in the quiz meaning box stays on the card')
        syn = await pg.evaluate(f"async () => (await import('./js/state.js')).getSynonyms('{info['id'].split('/')[0]}')")
        check('quiz meaning' in syn, 'meaning added during the quiz is saved')
        lesson_syn = await pg.evaluate(f"async () => (await import('./js/state.js')).getSynonyms('{item_id}')")
        check('my lesson meaning' in lesson_syn, 'meaning added on the lesson card is saved')

        check(not errors, 'no console errors' + ('' if not errors else ': ' + '; '.join(errors)))
        await b.close()


asyncio.run(main())
