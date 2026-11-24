"""A separately labelled logo set, run through the live logo comparison (AI vision), not the rule engine.

Twelve synthetic creatives are drawn in code, each labelled before it is run:
- approved: the approved Inkloom AI logo in three placements (expected: match)
- altered: the approved logo recoloured, stretched, or with a misspelt wordmark (expected: modified)
- wrong: the outdated orange logo from the sample ad (expected: modified or not found)
- absent: no logo at all, or another company's logo (expected: not found)
- degraded: the approved logo at low resolution or rotated, which a person may need to check (expected: match or uncertain)

`python -m backend.logo_eval --write` sends each creative, with the approved reference logo, through the same
`intelligence.inspect_visual` call the product uses, once, and saves every result to backend/eval/logos.json with the
date and the model that answered. AI output can differ between runs, so this is one recorded run, misses included.
CI checks that the published counts follow from the item results; it never calls the provider.
"""
import io, json, sys, time
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
from . import demo

OUT = Path(__file__).parent / 'eval' / 'logos.json'
ACCEPT = {'approved': ['match'], 'altered': ['modified'], 'wrong': ['modified', 'not_found'], 'absent': ['not_found'], 'degraded': ['match', 'uncertain']}
VIOLATIONS = ('altered', 'wrong', 'absent')  # a miss here would let an off-brand logo through
GENUINE = ('approved', 'degraded')           # a miss here is a false alarm on the real logo


def png(image):
    out = io.BytesIO(); image.convert('RGB').save(out, format='PNG'); return out.getvalue()


def logo(mark='#5b3df5', name=demo.COMPANY):
    """The approved logo drawing, with the colour or wordmark changed for the altered cases."""
    image = Image.new('RGB', (460, 120), 'white'); d = ImageDraw.Draw(image)
    d.rounded_rectangle((14, 16, 102, 104), 22, fill=mark)
    d.ellipse((40, 44, 76, 84), fill='white'); d.polygon([(58, 26), (41, 58), (75, 58)], fill='white')
    demo.write(d, (122, 34), name, 44, '#17133a', bold=True)
    return image


def card(mark=None, size=(1200, 900), bg='#fff8ee', at=(60, 48), headline='Review every campaign together.'):
    image = Image.new('RGB', size, bg); d = ImageDraw.Draw(image)
    if mark is not None:
        image.paste(mark, at)
    demo.write(d, (64, size[1] // 2 - 40), headline, 54, '#17133a', bold=True)
    demo.write(d, (66, size[1] // 2 + 50), 'Plan, review and approve campaign content in one place.', 28, '#3a3358')
    return image


def other_brand():
    image = Image.new('RGB', (420, 110), 'white'); d = ImageDraw.Draw(image)
    d.ellipse((10, 10, 100, 100), fill='#1f9d55'); d.rectangle((40, 40, 70, 70), fill='white')
    demo.write(d, (118, 30), 'Northwind', 44, '#0f3d2e', bold=True)
    return image


def gradient(size=(1200, 900)):
    image = Image.new('RGB', size); d = ImageDraw.Draw(image)
    for y in range(size[1]):
        t = y / size[1]; d.line((0, y, size[0], y), fill=(int(236 - 40 * t), int(231 - 60 * t), int(255 - 30 * t)))
    return image


def cases():
    """(id, group, description, PNG bytes) for every labelled creative. Deterministic: the same pixels every run."""
    approved = demo.approved_logo()
    lowres = approved.resize((92, 24)).resize((368, 96), Image.BILINEAR).filter(ImageFilter.GaussianBlur(1.2))
    rotated_bg = gradient(); rotated = approved.rotate(10, expand=True, fillcolor='white'); rotated_bg.paste(rotated, (70, 40))
    demo.write(ImageDraw.Draw(rotated_bg), (64, 420), 'Review every campaign together.', 54, '#17133a', bold=True)
    small = Image.new('RGB', (1200, 400), 'white'); small.paste(approved.resize((184, 48)), (980, 330))
    demo.write(ImageDraw.Draw(small), (60, 140), 'Campaign review, without the chaos.', 52, '#17133a', bold=True)
    return [
        ('approved-ad', 'approved', 'The corrected sample ad with the approved logo', demo.draw_ad(True)[0]),
        ('approved-social', 'approved', 'Approved logo on a square social card', png(card(approved.resize((552, 144)), (1080, 1080), '#f4f1ff', (264, 80)))),
        ('approved-small', 'approved', 'Approved logo small, bottom-right of a banner', png(small)),
        ('altered-colour', 'altered', 'Approved logo with the violet mark recoloured orange', png(card(logo(mark='#ff6a13')))),
        ('altered-stretch', 'altered', 'Approved logo stretched to 1.7 times its width', png(card(approved.resize((782, 120)), at=(40, 48)))),
        ('altered-name', 'altered', 'Approved mark with a misspelt wordmark (“Inkbloom AI”)', png(card(logo(name='Inkbloom AI')))),
        ('wrong-ad', 'wrong', 'The employee-uploaded sample ad with the outdated orange logo', demo.sample_ad()[0]),
        ('wrong-card', 'wrong', 'The outdated orange logo on a plain card', png(card(demo.outdated_logo()))),
        ('absent-text', 'absent', 'A text-only creative with no logo', png(card(None))),
        ('absent-other', 'absent', 'Another company’s logo (“Northwind”)', png(card(other_brand()))),
        ('degraded-lowres', 'degraded', 'Approved logo at very low resolution, blurred', png(card(lowres))),
        ('degraded-rotated', 'degraded', 'Approved logo rotated 10° on a gradient', png(rotated_bg)),
    ]


def summarise(items):
    ran = [i for i in items if i['result'] != 'error']
    caught = [i for i in ran if i['group'] in VIOLATIONS and i['result'] != 'match']
    alarms = [i for i in ran if i['group'] in GENUINE and i['result'] in ('modified', 'not_found')]
    return {'items': len(items), 'ran': len(ran), 'correct': sum(i['correct'] for i in ran),
            'violations': sum(i['group'] in VIOLATIONS for i in ran), 'violations_caught': len(caught),
            'genuine': sum(i['group'] in GENUINE for i in ran), 'false_alarms': len(alarms)}


def published():
    try:
        return json.loads(OUT.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None


def run():
    from . import ai, intelligence
    if not ai.vision_available():
        sys.exit('Live logo comparison needs a configured vision provider (GEMINI_API_KEY).')
    reference = [{'id': 'logo-1', 'name': 'Inkloom AI approved logo', 'blob': intelligence.normalize_image(demo.assets()['logo.png'][1], reference=True)}]
    items = []
    for case_id, group, description, blob in cases():
        result, model, note = 'error', '', ''
        for attempt in range(2):
            ai.track()
            try:
                found = intelligence.inspect_visual(blob, reference)['logos'][0]
                result, model, note = found['result'], ai.answered_by(), (found.get('explanation') or '')[:240]
                break
            except ai.ProviderError as exc:
                note = str(exc)[:240]; time.sleep(20)
        items.append({'id': case_id, 'group': group, 'description': description, 'expected': ACCEPT[group], 'result': result,
                      'correct': result in ACCEPT[group], 'model': model, 'note': note})
        print(f"{case_id:18} {group:9} expected {'/'.join(ACCEPT[group]):19} got {result:10} {'ok' if result in ACCEPT[group] else 'MISS'}  {model}")
        time.sleep(4)
    return {'checked_at': datetime.now(timezone.utc).replace(microsecond=0).isoformat(), 'provider': ai.provider(),
            'reference': 'Inkloom AI approved logo (the demo’s registered reference)',
            'method': ('Twelve synthetic creatives drawn in code (backend/logo_eval.py), labelled before running. Each was sent once, with the approved '
                       'reference logo, through the same logo comparison the product uses. AI output can differ between runs: this is one recorded run, '
                       'and every miss is listed. Separate from the rule-engine evaluation, which never uses AI.'),
            'items': items, 'summary': summarise(items)}


if __name__ == '__main__':
    report = run()
    print(json.dumps(report['summary']))
    if '--write' in sys.argv:
        previous = published()
        if previous and previous.get('tried_and_not_kept'):
            report['tried_and_not_kept'] = previous['tried_and_not_kept']  # keep the record of changes that did not help
        OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
        print('Wrote', OUT)
