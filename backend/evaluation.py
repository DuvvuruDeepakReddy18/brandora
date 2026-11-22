"""Measured reliability: the deterministic engine against a labelled set of synthetic Inkloom AI content.

The set lives in backend/eval/dataset.json. Development items were used while building the checks; held-out
items were written afterwards and are reported as they come out, including every miss and false alarm.
Run `python -m backend.evaluation` to print the report and refresh docs/reliability.json. CI re-runs it.
"""
import hashlib, json, re, sys
from functools import lru_cache
from pathlib import Path
from types import SimpleNamespace
from .engine import scan, access, contrast_ratio, fold, ungroup
from . import demo

HERE = Path(__file__).resolve().parent
DATASET = HERE / 'eval' / 'dataset.json'
REPORT = HERE.parent / 'docs' / 'reliability.json'


# Why each held-out failure happens. These are recorded as next improvements and deliberately not tuned away,
# so the held-out score stays an honest measure of unseen content.
EXPLANATIONS = {
    'held-04': 'Plan names must appear as registered. “Pro” is an informal alias for Professional and aliases are not mapped yet.',
    'held-08': 'Durations written in words (“a month”) are not parsed; only numbers are.',
    'held-10': 'Only listed misspellings are checked. A wrong capitalisation (“Inkloom Ai”) is not one of them.',
    'held-14': 'Mapped claims match their registered wording. “80 percent” is not recognised as “80%”.',
    'held-19': 'The superlative check flags “Best” in an email sign-off. It is raised for review, not as a verdict, but it is still a false alarm.',
}


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
    needle = f['span'] if rule.kind == 'substantiation' else ev.get('rule_value') or ''
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
    totals = {}; failures = []; cited = [0, 0]; clean = [0, 0]
    for item in data['items']:
        text = item_text(item)
        predicted = predict(item, rules, sources)
        unmatched = list(predicted); tp = 0
        for expected in item['expected']:
            hit = next((p for p in unmatched if matches(p, expected, text)), None)
            if hit:
                unmatched.remove(hit); tp += 1
            else:
                failures.append({'id': item['id'], 'split': item['split'], 'category': item['category'], 'kind': 'Missed', 'text': text,
                                 'detail': f"Expected {expected['rule']} · {expected.get('title') or expected['outcome']}" + (f" on “{expected['span']}”" if expected.get('span') else '')})
        for p in unmatched:
            failures.append({'id': item['id'], 'split': item['split'], 'category': item['category'], 'kind': 'False alarm', 'text': text,
                             'detail': f"Engine raised {p['rule_code']} · {p['title']}" + (f" on “{p['span'][:80]}”" if p.get('span') else '')})
        for f in predicted:
            ok = citation_valid(f, rules, sources)
            if ok is not None:
                cited[0] += 1; cited[1] += bool(ok)
        if not item['expected']:
            clean[0] += 1; clean[1] += bool(predicted)
        for key in ('all', 'split:' + item['split'], 'category:' + item['category']):
            t = totals.setdefault(key, [0, 0, 0, 0])
            t[0] += tp; t[1] += len(unmatched); t[2] += len(item['expected']) - tp; t[3] += 1
    def block(key):
        t = totals.get(key, [0, 0, 0, 0]); return {**rates(t[0], t[1], t[2]), 'items': t[3]}
    categories = sorted({i['category'] for i in data['items']})
    engine_source = normalised(HERE / 'engine.py')
    return {
        'dataset': {'items': len(data['items']), 'labelled_findings': sum(len(i['expected']) for i in data['items']), 'clean_controls': clean[0],
                    'splits': {s: sum(i['split'] == s for i in data['items']) for s in ('dev', 'heldout')}, 'sha256': hashlib.sha256(raw).hexdigest(),
                    'labelled_by': data.get('labelled_by', ''), 'note': data.get('note', '')},
        'overall': block('all'),
        'splits': {s: block('split:' + s) for s in ('dev', 'heldout')},
        'categories': [{'category': c, **block('category:' + c)} for c in categories],
        'citations': {'checked': cited[0], 'valid': cited[1], 'rate': round(cited[1] / cited[0], 4) if cited[0] else 1.0},
        'clean_controls': {'items': clean[0], 'with_findings': clean[1], 'false_alarm_rate': round(clean[1] / clean[0], 4) if clean[0] else 0.0},
        'failures': [{**f, 'why': EXPLANATIONS.get(f['id'], '')} for f in failures],
        'register': [r.code for r in rules],
        'engine_sha256': hashlib.sha256(engine_source).hexdigest(),
        'method': 'Each item is checked by the same rule engine the product uses, against the Inkloom AI register. A finding counts as correct when its rule, outcome and location match a labelled finding; anything else is a false alarm, and an unmatched label is a miss. Precision = correct / raised; recall = correct / labelled. Citation validity checks that every shown finding names the current approved source and that the source text contains the cited value or words. Unmapped claims make no factual verdict and carry no citation, so they are excluded from citation validity.',
    }


def summary(report):
    o, d, h = report['overall'], report['splits']['dev'], report['splits']['heldout']
    lines = [f"Items {report['dataset']['items']} (dev {report['dataset']['splits']['dev']}, held-out {report['dataset']['splits']['heldout']}, clean controls {report['dataset']['clean_controls']})",
             f"Overall precision {o['precision']:.1%} recall {o['recall']:.1%}  (tp {o['tp']} fp {o['fp']} fn {o['fn']})",
             f"Dev precision {d['precision']:.1%} recall {d['recall']:.1%}",
             f"Held-out precision {h['precision']:.1%} recall {h['recall']:.1%}",
             f"Citation validity {report['citations']['valid']}/{report['citations']['checked']}",
             f"Clean controls with a false alarm {report['clean_controls']['with_findings']}/{report['clean_controls']['items']}"]
    lines += [f"  {f['split']:7} {f['id']:12} {f['kind']:11} {f['detail']}" for f in report['failures']]
    return '\n'.join(lines)


if __name__ == '__main__':
    result = evaluate()
    print(summary(result))
    if '--write' in sys.argv:
        REPORT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        print('Wrote', REPORT.relative_to(HERE.parent))
