"""Quick visual smoke test: python3 tests/smoke.py [base_url] [out_dir]

Opens Today, a lesson batch and the lesson quiz, saving screenshots and printing any
console errors. Needs Playwright for Python and Chrome (or Playwright's Chromium).
"""
import asyncio, os, shutil, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'test-results'


async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        chrome = shutil.which('google-chrome')
        b = await p.chromium.launch(executable_path=chrome) if chrome else await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1100, 'height': 900})
        errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append('page error: ' + str(e)))
        await pg.goto(BASE + '#browse')  # any page but Today counts as having seen the welcome page
        await pg.wait_for_selector('.browse, .page', state='attached')
        await pg.goto(BASE + '#today')
        await pg.wait_for_selector('.today', timeout=15000)
        await pg.screenshot(path=f'{OUT}/today.png', full_page=True)
        await pg.click('[data-act="lessons"]')
        await pg.wait_for_selector('.lesson')
        await pg.screenshot(path=f'{OUT}/lesson-1.png', full_page=True)
        tabs = await pg.eval_on_selector_all('.lesson-tabs button', 'bs => bs.map(b => b.textContent)')
        print('batch:', ' '.join(tabs))
        for _ in range(len(tabs) - 1):
            await pg.click('[data-act="next"]')
        await pg.screenshot(path=f'{OUT}/lesson-last.png', full_page=True)
        await pg.click('[data-act="next"]')
        await pg.wait_for_selector('.quiz')
        await pg.screenshot(path=f'{OUT}/quiz.png', full_page=True)
        print('\n'.join(errs) or 'no console errors')
        await b.close()


asyncio.run(main())
