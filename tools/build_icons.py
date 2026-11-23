"""Render icon-512.png, icon-192.png and icon-180.png with the app's own Klee One font.

Usage: python3 tools/build_icons.py http://localhost:8000/   (the app, served locally)
"""
import asyncio, os, shutil, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def main():
    async with async_playwright() as p:
        chrome = shutil.which('google-chrome')
        b = await p.chromium.launch(executable_path=chrome) if chrome else await p.chromium.launch()
        pg = await b.new_page()
        await pg.goto(BASE + 'manifest.webmanifest')
        for size in (512, 192, 180):
            radius = 0 if size == 180 else round(size * 0.22)  # iOS rounds the corners itself
            await pg.set_viewport_size({'width': size, 'height': size})
            await pg.set_content(f"""<html><head><base href="{BASE}"><link rel="stylesheet" href="css/fonts.css"></head>
              <body style="margin:0;background:transparent">
              <div id="i" style="width:{size}px;height:{size}px;border-radius:{radius}px;background:#34489a;color:#f4f5f8;
                display:grid;place-items:center;font:600 {round(size * 0.62)}px 'Klee One';line-height:1">組</div></body></html>""")
            await pg.evaluate('document.fonts.ready')
            await pg.wait_for_timeout(300)
            await pg.locator('#i').screenshot(path=os.path.join(ROOT, f'icon-{size}.png'), omit_background=True)
        await b.close()


asyncio.run(main())
