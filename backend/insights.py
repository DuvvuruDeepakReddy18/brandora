"""From repeated mistakes to clearer guidelines.

Insights read FindingEvent history: what keeps going wrong (by rule, channel, campaign and team), and which rules
reviewers keep overriding or leave waiting. A clarified rule is replayed on that history before anyone applies it:
predicted findings are compared with what reviewers actually decided. People are grouped by team, never scored.
"""
import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from .engine import scan, digest

CONFIRMED = 'Confirmed'
OVERRIDES = ('Verified by reviewer', 'AI finding rejected')
CHANNELS = ('Website', 'Email', 'Social', 'Advertisement')
LABELS = {'REVIEW': 'Unmapped claims (need support)', 'LOGO': 'Logo treatment'}


def rule_hash(rule):
    return digest(json.dumps({'value': rule.value, 'config': rule.config or {}}, sort_keys=True))[:16]


def _age_days(created, now):
    try:
        return (now - datetime.fromisoformat(created)).days
    except ValueError:
        return 0


def build(events, rules):
    """Aggregate recorded findings. Returns recurring mistakes, breakdowns and possibly unclear rules."""
    now = datetime.now(timezone.utc)
    by_code = {r.code: r for r in rules}
    groups = defaultdict(list)
    for e in events:
        groups[e.rule_code or 'REVIEW'].append(e)
    recurring = []
    for code, items in groups.items():
        rule = by_code.get(code)
        confirmed = [e for e in items if e.review == CONFIRMED]
        overridden = [e for e in items if e.review in OVERRIDES]
        recent = sum(_age_days(e.created, now) < 30 for e in items)
        spans = Counter(e.span.strip().casefold() for e in items if e.span.strip())
        top_span = next((e.span.strip() for e in items if spans and e.span.strip().casefold() == spans.most_common(1)[0][0]), '')
        recurring.append({
            'rule_code': code, 'rule_id': rule.id if rule else '', 'title': rule.title if rule else LABELS.get(code, code), 'kind': rule.kind if rule else 'review',
            'count': len(items), 'items': len({(e.content_id or e.content_title, e.version) for e in items}),
            'last_30_days': recent, 'previous_30_days': sum(30 <= _age_days(e.created, now) < 60 for e in items),
            'confirmed': len(confirmed), 'overridden': len(overridden), 'undecided': sum(not e.review for e in items),
            'needs_review': sum(e.outcome == 'Low Confidence' for e in items),
            'channels': dict(Counter(e.channel for e in items).most_common()), 'campaigns': dict(Counter(e.campaign for e in items).most_common()),
            'teams': dict(Counter(e.team for e in items).most_common()),
            'example': top_span, 'example_count': spans.most_common(1)[0][1] if spans else 0,
            'fictional': sum(e.fictional for e in items),
        })
    recurring.sort(key=lambda r: (-r['count'], r['rule_code']))

    def breakdown(attr):
        out = defaultdict(lambda: {'count': 0, 'rules': Counter()})
        for e in events:
            key = getattr(e, attr) or '—'
            out[key]['count'] += 1; out[key]['rules'][e.rule_code or 'REVIEW'] += 1
        return [{'name': k, 'count': v['count'], 'top_rules': [{'rule_code': c, 'count': n} for c, n in v['rules'].most_common(3)]} for k, v in sorted(out.items(), key=lambda kv: -kv[1]['count'])]

    unclear = []
    for r in recurring:
        decided = r['confirmed'] + r['overridden']
        signals = []
        if decided >= 4 and r['overridden'] / decided >= 0.4:
            signals.append(f"Reviewers overrode {r['overridden']} of {decided} decisions ({r['overridden'] / decided:.0%}).")
        if r['needs_review'] >= 6 and r['needs_review'] / max(1, r['count']) >= 0.5:
            signals.append(f"{r['needs_review']} of its {r['count']} findings needed a reviewer's judgement rather than a clear verdict.")
        if not signals:
            continue
        items = groups[r['rule_code']]
        over = [e for e in items if e.review in OVERRIDES]
        by_channel = Counter(e.channel for e in over)
        concentrated = ''
        if over and by_channel.most_common(1)[0][1] / len(over) >= 0.7:
            channel = by_channel.most_common(1)[0][0]
            elsewhere = [e for e in items if e.channel != channel and e.review]
            if elsewhere and sum(e.review == CONFIRMED for e in elsewhere) / len(elsewhere) >= 0.6:
                concentrated = channel
        if concentrated:
            signals.append(f"{by_channel[concentrated]} of the {len(over)} overrides were on {concentrated}, while reviewers confirmed it elsewhere.")
        reason = Counter(e.review_reason for e in over if e.review_reason).most_common(1)
        unclear.append({**{k: r[k] for k in ('rule_code', 'rule_id', 'title', 'kind', 'count', 'confirmed', 'overridden', 'needs_review')},
                        'signals': signals, 'channel': concentrated, 'reviewer_reason': reason[0][0] if reason else '',
                        'suggestion': suggest(by_code.get(r['rule_code']), concentrated, over)})
    return {'recurring': recurring, 'by_channel': breakdown('channel'), 'by_campaign': breakdown('campaign'), 'by_team': breakdown('team'), 'unclear': unclear}


def suggest(rule, channel, overrides):
    """A concrete clarification when the history supports one; otherwise advice for a person to act on."""
    if rule is None:
        span = Counter(e.span for e in overrides).most_common(1)
        return {'type': 'advice', 'text': (f'Reviewers keep accepting “{span[0][0][:80].rstrip(".")}”. If it is true, add it to the approved claims register with its evidence so it is verified automatically.' if span else 'Map recurring claims to approved evidence in Company Hub.')}
    cfg = dict(rule.config or {})
    if rule.kind == 'number' and cfg.get('qualifier') and channel:
        keep = [c for c in (cfg.get('qualifier_channels') or CHANNELS) if c != channel]
        return {'type': 'config', 'config': {**cfg, 'qualifier_channels': keep},
                'text': f'Ask for “{cfg.get("qualifier_text", cfg["qualifier"])}” next to the price only on {", ".join(keep)}. On {channel}, reviewers accept the price without it.'}
    if rule.kind == 'tone':
        words = Counter(e.span.casefold() for e in overrides).most_common(1)
        if words:
            word = words[0][0]; trimmed = {k: {t: v for t, v in (cfg.get(k) or {}).items() if t.casefold() != word} for k in ('avoid', 'messaging', 'preferred')}
            return {'type': 'config', 'config': {**cfg, **trimmed}, 'text': f'Stop flagging “{word}”: reviewers accept it in context.'}
    return {'type': 'advice', 'text': 'Reword the rule or narrow where it applies, then replay it on history before applying.'}


def replay(events, rule, value, config, sources, live=()):
    """Run the current and the clarified rule on every recorded text where this rule raised something.
    Predicted outcomes are compared with what reviewers actually decided. Nothing is changed."""
    proposed = SimpleNamespace(**{**{k: getattr(rule, k) for k in ('id', 'org_id', 'source_id', 'code', 'title', 'kind', 'subject', 'active')}, 'value': value, 'config': config})
    cache = {}

    def run(r, body, subject, channel):
        key = (id(r), body, subject, channel)
        if key not in cache:
            cache[key] = [f for f in scan(body, subject, channel, [r], sources)[0] if f['rule_id'] == rule.id]
        return cache[key]

    def same(f, findings):
        return any(g['title'] == f['title'] and g['start'] == f['start'] and g['end'] == f['end'] for g in findings)

    rows = []; tally = Counter(); added = []
    for e in events:
        if e.rule_id != rule.id or not e.body:
            continue
        after = run(proposed, e.body, e.subject, e.channel)
        before = run(rule, e.body, e.subject, e.channel)
        original = next((f for f in before if f['id'] == e.finding_id), None) or next((f for f in before if f['title'] == e.title and f['span'] == e.span), None)
        kept = bool(original and same(original, after))
        if e.review == CONFIRMED:
            verdict = 'Matches reviewer' if kept else 'Would miss a confirmed issue'; tally['confirmed_kept' if kept else 'confirmed_missed'] += 1
        elif e.review in OVERRIDES:
            verdict = 'Matches reviewer' if not kept else 'Still raised'; tally['overrides_removed' if not kept else 'overrides_kept'] += 1
        else:
            verdict = 'No decision recorded'; tally['undecided_removed' if not kept else 'undecided_kept'] += 1
        rows.append({'content': e.content_title, 'channel': e.channel, 'span': e.span, 'title': e.title, 'reviewer': e.review or 'Undecided',
                     'before': 'Raised', 'after': 'Raised' if kept else 'Not raised', 'verdict': verdict, 'fictional': bool(e.fictional)})
    for c in live:
        before = run(rule, c.body, c.subject, c.channel); after = run(proposed, c.body, c.subject, c.channel)
        new = [f for f in after if not same(f, before)]; gone = [f for f in before if not same(f, after)]
        if new or gone:
            added.append({'content': c.title, 'channel': c.channel, 'added': len(new), 'removed': len(gone), 'examples': [f['title'] + ' · ' + f['span'][:60] for f in new + gone][:3]})
    decided = tally['confirmed_kept'] + tally['confirmed_missed'] + tally['overrides_removed'] + tally['overrides_kept']
    rows.sort(key=lambda r: (r['verdict'] != 'Would miss a confirmed issue', r['verdict'] != 'Still raised', r['reviewer'] == 'Undecided', r['channel']))
    return {'decided': decided, 'agreement_before': round((tally['confirmed_kept'] + tally['confirmed_missed']) / decided, 4) if decided else None,
            'agreement_after': round((tally['confirmed_kept'] + tally['overrides_removed']) / decided, 4) if decided else None,
            **{k: tally[k] for k in ('confirmed_kept', 'confirmed_missed', 'overrides_removed', 'overrides_kept', 'undecided_removed', 'undecided_kept')},
            'history_rows': len(rows), 'rows': rows[:40], 'current_content': added, 'rule_hash': rule_hash(rule), 'replayed': datetime.now(timezone.utc).isoformat()}


def tips(events, rules):
    """Plain advice for creators: the mistakes reviewers keep confirming, without any team or person data."""
    by_code = {r.code: r for r in rules}
    out = []
    for r in build(events, rules)['recurring']:
        rule = by_code.get(r['rule_code'])
        if not rule or r['confirmed'] + r['undecided'] < 3 or r['overridden'] > r['confirmed']:
            continue
        cfg = rule.config or {}
        if rule.kind == 'number':
            what = {'trial': f'The free trial is {rule.value} days', 'price': f'{cfg.get("plan", "This")} plan price is ₹{int(float(rule.value)):,}/month'}.get(cfg.get('metric'), rule.title)
        elif rule.kind == 'term':
            what = f'Write the product name as “{rule.value}”'
        elif rule.kind == 'tone':
            what = 'Keep to the brand voice: no hype or pressure words'
        elif rule.kind == 'accessibility':
            what = 'Check text contrast, text size and alt text before you upload'
        else:
            what = rule.title
        out.append({'rule_code': rule.code, 'tip': what, 'count': r['count'], 'example': r['example']})
    return out[:4]
