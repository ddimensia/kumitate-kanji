"""Merge the mnemonic sets into data/mnemonics.json. Usage: python3 tools/build_mnemonics.py"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import mnemonics_n5 as n5
import mnemonics_n4 as n4

sounds = dict(n5.SOUNDS)
for k, v in n4.SOUNDS.items():
    if k in sounds and sounds[k].lower() != v.lower():
        raise SystemExit(f'{k}: N5 uses "{sounds[k]}", N4 "{v}"')
    sounds[k] = v
kanji = {**n5.M, **n4.M}
out = {
    'about': 'Generated mnemonics for kanji readings (JLPT N5 and N4). **meaning**, [[sound-alike]]: only the part spelled the way you would type the reading ([[to]]e for と, [[shi]]p for し). CC BY-SA 4.0, like the rest of the data.',
    'sounds': sounds,
    'kanji': kanji,
}
json.dump(out, open(os.path.join(ROOT, 'data', 'mnemonics.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(sum(len(v) for v in kanji.values()), 'mnemonics for', len(kanji), 'kanji')
