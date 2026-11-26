"""WaniKani import against a fake API: python3 tests/wanikani_test.py [base_url]

Intercepts api.wanikani.com, so no real token is needed.
"""
import asyncio, json, shutil, sys, datetime as dt
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
NOW = dt.datetime(2026, 3, 2, 12, 0, tzinfo=dt.timezone.utc)
IN_3_DAYS = (NOW + dt.timedelta(days=3)).isoformat().replace('+00:00', 'Z')

# id: (object, characters, srs_stage, available_at)
SUBJECTS = {
    1: ('radical', '口', 5, IN_3_DAYS),
    2: ('radical', None, 6, IN_3_DAYS),       # an image-only WaniKani radical
    3: ('radical', '亅', 9, None),              # no match here
    4: ('kanji', '働', 8, IN_3_DAYS),
    5: ('kanji', '日', 9, None),
    6: ('vocabulary', '働く', 6, IN_3_DAYS),
    7: ('vocabulary', '〜人', 1, IN_3_DAYS),   # prefix marker stripped -> 人
    8: ('kanji', '鷲', 5, IN_3_DAYS),          # not in the JLPT lists
}


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print('ok -', msg)


async def fake_api(route):
    url = route.request.url
    if route.request.headers.get('authorization') != 'Bearer good-token':
        return await route.fulfill(status=401, body='{}')
    if '/v2/user' in url:
        body = {'data': {'username': 'tester', 'level': 7}}
    elif '/v2/assignments' in url:
        body = {'data': [{'data': {'subject_id': i, 'srs_stage': s[2], 'available_at': s[3]}} for i, s in SUBJECTS.items()],
                'pages': {'next_url': None}}
    elif '/v2/subjects' in url:
        ids = [int(x) for x in url.split('ids=')[1].split('&')[0].split(',')]
        body = {'data': [{'id': i, 'object': SUBJECTS[i][0], 'data': {'characters': SUBJECTS[i][1]}} for i in ids],
                'pages': {'next_url': None}}
    else:
        return await route.fulfill(status=404, body='{}')
    await route.fulfill(status=200, content_type='application/json', body=json.dumps(body),
                        headers={'Access-Control-Allow-Origin': '*'})


async def main():
    async with async_playwright() as p:
        chrome = shutil.which('google-chrome')
        b = await p.chromium.launch(executable_path=chrome) if chrome else await p.chromium.launch()
        ctx = await b.new_context()
        await ctx.route('https://api.wanikani.com/**', fake_api)
        pg = await ctx.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        await pg.clock.install(time=NOW)
        await pg.goto(BASE + '#settings')
        await pg.wait_for_selector('.wk-form')

        await pg.fill('.wk-form input[name="token"]', 'wrong')
        await pg.click('.wk-form button')
        await pg.wait_for_selector('#toast.is-error')
        check('didn’t accept' in await pg.text_content('#toast'), 'a rejected token gives a clear message')

        await pg.fill('.wk-form input[name="token"]', 'good-token')
        await pg.check('.wk-form input[name="remember"]')
        await pg.click('.wk-form button')
        await pg.wait_for_selector('[data-act="wk-import"]')
        text = await pg.text_content('.wk-preview')
        check('tester' in text and '7 items started' in text, 'preview shows the account and items started')
        check('1 radical (' in text and '1 kanji outside' in text and '0 words' in text, f'unmatched items are listed: {text.split("skipped:")[-1].strip()[:90]}')
        await pg.click('[data-act="wk-import"]')
        await pg.wait_for_selector('text=Imported')

        res = await pg.evaluate("""async () => {
          const s = await import('./js/state.js'); const d = await import('./js/data.js');
          const out = {};
          for (const id of ['r:口', 'k:働', 'k:日', 'k:動', 'r:亻', 'k:人', 'v:' + [...d.item('k:働').vocab].map(d.item).find((v) => v.w === '働く').id.slice(2)]) {
            const it = d.item(id);
            const cs = d.cardTypes(it).map((t) => s.getCard(d.cardId(id, t)));
            out[id] = { stage: s.stage(it), passed: s.isPassed(id), due: cs.map((c) => c && c.srs.due) };
          }
          const hito = [...d.item('k:人').vocab].map(d.item).find((v) => v.w === '人');
          out.hito = hito ? s.stage(hito) : null;
          out.token = await (await import('./js/store.js')).kvGet('wkToken');
          return out;
        }""")
        check(res['r:口']['stage'] == 'settling' and res['r:口']['passed'], f"Guru I radical: in review and unlocked what uses it ({res}) errors={errors}")
        check(res['k:働']['stage'] == 'mastered', 'Enlightened kanji: mastered')
        check(all(d.startswith(IN_3_DAYS[:13]) for d in res['k:働']['due']), 'next review matches WaniKani’s')
        check(res['k:日']['stage'] == 'mastered', 'burned kanji: mastered')
        check(res['k:動']['stage'] == 'mastered' and res['r:亻']['stage'] == 'mastered', 'parts of 働 come along at its stage')
        check(res['hito'] == 'learning', f'Apprentice I word 〜人 matched to 人 and starts as learning ({res["hito"]})')
        vocab = [k for k in res if k.startswith('v:')][0]
        check(res[vocab]['stage'] == 'settling', '働く (Guru II word) imported')
        check(res['token'] == 'good-token', 'token remembered when asked')

        backup = await pg.evaluate("async () => JSON.stringify(await (await import('./js/store.js')).exportAll())")
        check('good-token' not in backup, 'token is not in backups')

        # Running it again with "skip studied" on finds nothing new to do.
        await pg.reload()
        await pg.wait_for_selector('.wk-form')
        await pg.wait_for_function("document.querySelector('.wk-form input[name=token]').value === 'good-token'")
        await pg.click('.wk-form button')
        await pg.wait_for_selector('[data-act="wk-import"]')
        check('Import 0 items' in await pg.text_content('[data-act="wk-import"]'), 'a second import skips what is already here')

        check(not errors, 'no page errors' + ('' if not errors else ': ' + '; '.join(errors)))
        await b.close()


asyncio.run(main())
