"""Measured reliability: the deterministic engine against a labelled set of synthetic Inkloom AI content.

The set lives in backend/eval/dataset.json. Development items were used while building the checks. Each held-out
round is written after the checks are frozen and reported as it comes out, including every miss and false alarm.
A round's first-run results are kept in backend/eval/history.json; once its misses are fixed it counts as
development data and a fresh round is written. Run `python -m backend.evaluation` to print the report and
`--write` to refresh docs/reliability.json. CI re-runs it and fails if it is stale or scores drop.
"""
import hashlib, json, re, sys
from functools import lru_cache
from pathlib import Path
from types import SimpleNamespace
from .engine import scan, access, contrast_ratio, fold, ungroup
from . import demo

HERE = Path(__file__).resolve().parent
DATASET = HERE / 'eval' / 'dataset.json'
HISTORY = HERE / 'eval' / 'history.json'
REPORT = HERE.parent / 'docs' / 'reliability.json'


# Why each current failure happens. Failures of the latest held-out round are reported as measured and are the
# next improvements; they are not tuned away before a fresh round is written.
EXPLANATIONS = {
    'fresh-17': 'The claim is registered as “Reduce your marketing production time by 80%”. This paraphrase changes the verb (“Cut”), which the claim matcher does not treat as the same claim. The sentence is still flagged for human review as an unmapped percentage claim, so it is not missed silently, but it counts as a miss and a false alarm.',
    'fresh-23': '“Wishing you the best” is a well-wish, not a superlative claim. Only “best regards” and “best wishes” are recognised as sign-offs. It is raised for review, not as a verdict.',
    'fresh-32': 'Preferred-term matching covers simple inflections (leverages, leveraged) but not “leveraging”, where the final “e” is dropped.',
}
SPLIT_NAMES = {'dev': 'Development', 'heldout': 'Held-out round 1', 'heldout2': 'Held-out round 2 (fresh)'}


def register():
    """The Inkloom AI register used by every demo workspace, as detached objects (no database)."""
    sources = {}
    for key, title, owner, excerpt in demo.SOURCES:
        sources['src-' + key] = SimpleNamespace(id='src-' + key, title=title, owner=owner, excerpt=excerpt, version=1, status='approved', review_date='')
    rules = [SimpleNamespace(id='rule-' + code, code=code, title=title, kind=kind, value=value, subject=demo.COMPANY, config=config, active=1, source_id='src-' + key)
             for code, title, kind, value, key, config in demo.RULES]
    return rules, sources


def item_text(item):
    if item.get('measure'):
        return ' | '.join(r['text'] for r in item['measure'].get('regions', [])) or '(images only)'
    return item['text']


def predict(item, rules, sources):
    channel = item.get('channel', 'Website')
    if item.get('measure'):
        regions = []
        for r in item['measure'].get('regions', []):
            regions.append({'text': r['text'], 'start': 0, 'end': len(r['text']), 'page': 0, 'size_pt': r.get('size_pt'), 'bold': r.get('bold', False),
                            'contrast': {'fg': r['fg'], 'bg': r['bg'], 'ratio': contrast_ratio(r['fg'], r['bg']), 'method': 'labelled colours'}})
        return access(regions, item['measure'].get('images', []), rules, sources, demo.COMPANY, channel)[0]
    return scan(item['text'], demo.COMPANY, channel, rules, sources)[0]


def matches(pred, expected, text):
    if pred['rule_code'] != expected['rule'] or pred['outcome'] != expected['outcome']:
        return False
    if expected.get('title') and pred['title'] != expected['title']:
        return False
    if not expected.get('span'):
        return True
    at = text.find(expected['span'])
    return at >= 0 and pred['start'] < at + len(expected['span']) and at < max(pred['end'], pred['start'] + 1)


def citation_valid(f, rules, sources):
    """A shown finding's citation is valid when it names the current approved source and that source's text
    contains the cited words (the approved value, the cited guideline words, or the mapped claim)."""
    ev = f.get('evidence')
    if not ev:
        return None
    rule = next((r for r in rules if r.id == f['rule_id']), None)
    source = sources.get(ev['source_id'])
    if not rule or not source or ev['version'] != source.version or ev['excerpt'] != source.excerpt or rule.source_id != source.id:
        return False
    if rule.kind == 'number':
        return bool(re.search(r'(?<![\d.])' + re.escape(ungroup(rule.value)) + r'(?![\d.])', ungroup(source.excerpt)))
    needle = ev.get('rule_value') or ''  # the cited words: approved value, guideline words or the claim as registered
    return bool(needle) and fold(needle).casefold() in fold(source.excerpt).casefold()


def rates(tp, fp, fn):
    return {'tp': tp, 'fp': fp, 'fn': fn, 'precision': round(tp / (tp + fp), 4) if tp + fp else 1.0, 'recall': round(tp / (tp + fn), 4) if tp + fn else 1.0}


def normalised(path):
    """File bytes with Windows line endings folded, so published hashes match on every OS and checkout."""
    return path.read_bytes().replace(bytes([13, 10]), bytes([10]))


@lru_cache(maxsize=1)
def evaluate():
    raw = normalised(DATASET)
    data = json.loads(raw)
    rules, sources = register()
    splits = list(dict.fromkeys(i['split'] for i in data['items']))
    totals = {}; failures = []; cited = {}; clean = {}
    for item in data['items']:
        text = item_text(item); split = item['split']
        predicted = predict(item, rules, sources)
        unmatched = list(predicted); tp = 0
        for expected in item['expected']:
            hit = next((p for p in unmatched if matches(p, expected, text)), None)
            if hit:
                unmatched.remove(hit); tp += 1
            else:
                failures.append({'id': item['id'], 'split': split, 'category': item['category'], 'kind': 'Missed', 'text': text,
                                 'detail': f"Expected {expected['rule']} · {expected.get('title') or expected['outcome']}" + (f" on “{expected['span']}”" if expected.get('span') else '')})
        for p in unmatched:
            failures.append({'id': item['id'], 'split': split, 'category': item['category'], 'kind': 'False alarm', 'text': text,
                             'detail': f"Engine raised {p['rule_code']} · {p['title']}" + (f" on “{p['span'][:80]}”" if p.get('span') else '')})
        for key in ('all', split):
            c = cited.setdefault(key, [0, 0]); k = clean.setdefault(key, [0, 0])
            for f in predicted:
                ok = citation_valid(f, rules, sources)
                if ok is not None:
                    c[0] += 1; c[1] += bool(ok)
            if not item['expected']:
                k[0] += 1; k[1] += bool(predicted)
        for key in ('all', 'split:' + split, 'category:' + item['category']):
            t = totals.setdefault(key, [0, 0, 0, 0])
            t[0] += tp; t[1] += len(unmatched); t[2] += len(item['expected']) - tp; t[3] += 1

    def block(key):
        t = totals.get(key, [0, 0, 0, 0]); return {**rates(t[0], t[1], t[2]), 'items': t[3]}

    def extras(key):
        c = cited.get(key, [0, 0]); k = clean.get(key, [0, 0])
        return {'citations': {'checked': c[0], 'valid': c[1], 'rate': round(c[1] / c[0], 4) if c[0] else 1.0},
                'clean_controls': {'items': k[0], 'with_findings': k[1], 'false_alarm_rate': round(k[1] / k[0], 4) if k[0] else 0.0}}
    categories = sorted({i['category'] for i in data['items']})
    history = json.loads(normalised(HISTORY)) if HISTORY.exists() else {'rounds': []}
    headline = [s for s in splits if s.startswith('heldout')][-1]
    return {
        'dataset': {'items': len(data['items']), 'labelled_findings': sum(len(i['expected']) for i in data['items']), 'clean_controls': clean['all'][0],
                    'splits': {s: sum(i['split'] == s for i in data['items']) for s in splits}, 'split_names': {s: SPLIT_NAMES.get(s, s) for s in splits},
                    'sha256': hashlib.sha256(raw).hexdigest(), 'labelled_by': data.get('labelled_by', ''), 'note': data.get('note', '')},
        'headline_split': headline,
        'overall': block('all'),
        'splits': {s: {**block('split:' + s), **extras(s)} for s in splits},
        'categories': [{'category': c, **block('category:' + c)} for c in categories],
        **extras('all'),
        'failures': [{**f, 'why': EXPLANATIONS.get(f['id'], '')} for f in failures],
        'history': history,
        'register': [r.code for r in rules],
        'engine_sha256': hashlib.sha256(normalised(HERE / 'engine.py')).hexdigest(),
        'method': 'Each item is checked by the same rule engine the product uses, against the Inkloom AI register. A finding counts as correct when its rule, outcome and location match a labelled finding; anything else is a false alarm, and an unmatched label is a miss. Precision = correct / raised; recall = correct / labelled. Citation validity checks that every shown finding names the current approved source and that the source text contains the cited value, guideline words or registered claim. Unmapped claims make no factual verdict and carry no citation, so they are excluded from citation validity.',
    }


def summary(report):
    d = report['dataset']
    lines = [f"Items {d['items']} ({', '.join(f'{k} {v}' for k, v in d['splits'].items())}; clean controls {d['clean_controls']})"]
    for name, r in report['splits'].items():
        lines.append(f"{name:9} precision {r['precision']:.1%} recall {r['recall']:.1%} (tp {r['tp']} fp {r['fp']} fn {r['fn']}) · citations {r['citations']['valid']}/{r['citations']['checked']} · clean flagged {r['clean_controls']['with_findings']}/{r['clean_controls']['items']}")
    lines.append(f"Citation validity {report['citations']['valid']}/{report['citations']['checked']}")
    lines += [f"  {f['split']:9} {f['id']:12} {f['kind']:11} {f['detail']}" for f in report['failures']]
    return '\n'.join(lines)


if __name__ == '__main__':
    result = evaluate()
    print(summary(result))
    if '--write' in sys.argv:
        REPORT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        print('Wrote', REPORT.relative_to(HERE.parent))
