"""Sanity-check a rebuilt data/curriculum.json against the current one.

Usage: python3 tools/check_data.py OLD.json NEW.json
Prints a Markdown summary; exits non-zero if the new file looks broken.
"""
import json, sys

old = json.load(open(sys.argv[1], encoding='utf-8'))
new = json.load(open(sys.argv[2], encoding='utf-8'))
problems = []


def count(d, kind):
    return sum(1 for x in d['order'] if x.startswith(kind + ':'))


print('| | before | after |\n|---|---|---|')
for kind, name in (('r', 'radicals'), ('k', 'kanji'), ('v', 'words')):
    a, b = count(old, kind), count(new, kind)
    print(f'| {name} | {a} | {b} |')
    if b < a * 0.95:
        problems.append(f'{name} dropped from {a} to {b}')

for c in '日一人大年本中出見話上下':
    k = new['kanji'].get(c)
    if not k or not k['m'] or not any(r[2] for r in k['on'] + k['kun']):
        problems.append(f'{c} is missing meanings or common readings')
for id_ in new['order']:
    kind, key = id_.split(':', 1)
    table = {'r': 'radicals', 'k': 'kanji', 'v': 'vocab'}[kind]
    if key not in new[table]:
        problems.append(f'{id_} is in the order but has no entry')
        break
placed = set()
for id_ in new['order']:
    if id_.startswith('k:'):
        for p in new['kanji'][id_[2:]]['p']:
            if p not in placed:
                problems.append(f'{id_} comes before its part {p}')
                break
    placed.add(id_)

print()
print('\n'.join(f'- {p}' for p in problems) if problems else 'No problems found.')
sys.exit(1 if problems else 0)
